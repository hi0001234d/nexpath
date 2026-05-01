import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PromptRecord, UserProfile } from './types.js';
import {
  MIN_PROFILE_PROMPTS,
  LLM_CLASSIFIER_MODEL,
  LLM_CLASSIFIER_MAX_TOKENS,
  LLM_CLASSIFIER_TEMP,
  buildClassifierPrompt,
  validateClassifierResponse,
  deriveScores,
  buildSafeDefaults,
  classifyUserProfileLLM,
} from './LLMProfileClassifier.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRecord(text: string, index = 0): PromptRecord {
  return { index, text, capturedAt: Date.now(), classifiedStage: 'implementation', confidence: 0.8 };
}

function makeHistory(n: number): PromptRecord[] {
  return Array.from({ length: n }, (_, i) => makeRecord(`prompt number ${i + 1}`, i));
}

function makeExistingProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    nature:             'hardcore_pro',
    precisionScore:     9.0,
    playfulnessScore:   2.0,
    precisionOrdinal:   'very_high',
    playfulnessOrdinal: 'low',
    mood:               'focused',
    depth:              'high',
    depthScore:         3.0,
    computedAt:         10,
    ...overrides,
  };
}

function makeValidRaw(overrides: Record<string, string> = {}): string {
  return JSON.stringify({
    nature:      'hardcore_pro',
    mood:        'focused',
    depth:       'high',
    precision:   'very_high',
    playfulness: 'low',
    ...overrides,
  });
}

function makeMockOpenAI(content: string): object {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
        }),
      },
    },
  };
}

// ── Constants ──────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('MIN_PROFILE_PROMPTS is 4', () => {
    expect(MIN_PROFILE_PROMPTS).toBe(4);
  });

  it('LLM_CLASSIFIER_MODEL is gpt-4o-mini', () => {
    expect(LLM_CLASSIFIER_MODEL).toBe('gpt-4o-mini');
  });

  it('LLM_CLASSIFIER_MAX_TOKENS is 80', () => {
    expect(LLM_CLASSIFIER_MAX_TOKENS).toBe(80);
  });

  it('LLM_CLASSIFIER_TEMP is 0', () => {
    expect(LLM_CLASSIFIER_TEMP).toBe(0);
  });
});

// ── deriveScores ───────────────────────────────────────────────────────────────

describe('deriveScores', () => {
  it('very_high precision → precisionScore 9.0', () => {
    expect(deriveScores('very_high', 'medium', 'medium').precisionScore).toBe(9.0);
  });

  it('high precision → precisionScore 7.0', () => {
    expect(deriveScores('high', 'medium', 'medium').precisionScore).toBe(7.0);
  });

  it('medium precision → precisionScore 5.0', () => {
    expect(deriveScores('medium', 'medium', 'medium').precisionScore).toBe(5.0);
  });

  it('low precision → precisionScore 2.0', () => {
    expect(deriveScores('low', 'medium', 'medium').precisionScore).toBe(2.0);
  });

  it('very_high playfulness → playfulnessScore 9.0', () => {
    expect(deriveScores('medium', 'very_high', 'medium').playfulnessScore).toBe(9.0);
  });

  it('high playfulness → playfulnessScore 7.0', () => {
    expect(deriveScores('medium', 'high', 'medium').playfulnessScore).toBe(7.0);
  });

  it('medium playfulness → playfulnessScore 5.0', () => {
    expect(deriveScores('medium', 'medium', 'medium').playfulnessScore).toBe(5.0);
  });

  it('low playfulness → playfulnessScore 2.0', () => {
    expect(deriveScores('medium', 'low', 'medium').playfulnessScore).toBe(2.0);
  });

  it('depth high → depthScore 3.0', () => {
    expect(deriveScores('medium', 'medium', 'high').depthScore).toBe(3.0);
  });

  it('depth medium → depthScore 1.0', () => {
    expect(deriveScores('medium', 'medium', 'medium').depthScore).toBe(1.0);
  });

  it('depth low → depthScore 0.1', () => {
    expect(deriveScores('medium', 'medium', 'low').depthScore).toBe(0.1);
  });

  it('all very_high + high depth → all max scores', () => {
    const s = deriveScores('very_high', 'very_high', 'high');
    expect(s.precisionScore).toBe(9.0);
    expect(s.playfulnessScore).toBe(9.0);
    expect(s.depthScore).toBe(3.0);
  });
});

// ── buildSafeDefaults ──────────────────────────────────────────────────────────

describe('buildSafeDefaults', () => {
  it('returns beginner nature', () => {
    expect(buildSafeDefaults(0).nature).toBe('beginner');
  });

  it('returns casual mood', () => {
    expect(buildSafeDefaults(0).mood).toBe('casual');
  });

  it('returns medium depth', () => {
    expect(buildSafeDefaults(0).depth).toBe('medium');
  });

  it('returns medium precisionOrdinal', () => {
    expect(buildSafeDefaults(0).precisionOrdinal).toBe('medium');
  });

  it('returns medium playfulnessOrdinal', () => {
    expect(buildSafeDefaults(0).playfulnessOrdinal).toBe('medium');
  });

  it('derives correct numeric scores from medium/medium/medium', () => {
    const d = buildSafeDefaults(0);
    expect(d.precisionScore).toBe(5.0);
    expect(d.playfulnessScore).toBe(5.0);
    expect(d.depthScore).toBe(1.0);
  });

  it('stamps computedAt with the provided promptCount', () => {
    expect(buildSafeDefaults(42).computedAt).toBe(42);
  });
});

// ── buildClassifierPrompt ──────────────────────────────────────────────────────

describe('buildClassifierPrompt', () => {
  const history = [
    makeRecord('Build REST API endpoints for vehicle CRUD', 0),
    makeRecord('Add pagination with page and limit params', 1),
    makeRecord('Write unit tests for the vehicle controller', 2),
    makeRecord('Handle concurrent requests safely', 3),
  ];

  it('system message mentions developer profile classifier', () => {
    const { system } = buildClassifierPrompt(history);
    expect(system).toContain('developer profile classifier');
  });

  it('system message instructs to return ONLY valid JSON', () => {
    const { system } = buildClassifierPrompt(history);
    expect(system).toContain('Return ONLY valid JSON');
  });

  it('user message contains all prompt texts numbered', () => {
    const { user } = buildClassifierPrompt(history);
    expect(user).toContain('1. Build REST API endpoints');
    expect(user).toContain('2. Add pagination');
    expect(user).toContain('3. Write unit tests');
    expect(user).toContain('4. Handle concurrent requests');
  });

  it('user message contains prompt count in header', () => {
    const { user } = buildClassifierPrompt(history);
    expect(user).toContain('last 4 prompts');
  });

  it('user message contains NATURE section', () => {
    const { user } = buildClassifierPrompt(history);
    expect(user).toContain('NATURE');
    expect(user).toContain('hardcore_pro');
    expect(user).toContain('pro_geek_soul');
    expect(user).toContain('cool_geek');
    expect(user).toContain('beginner');
  });

  it('user message contains MOOD section', () => {
    const { user } = buildClassifierPrompt(history);
    expect(user).toContain('MOOD');
    expect(user).toContain('frustrated');
    expect(user).toContain('rushed');
    expect(user).toContain('excited');
    expect(user).toContain('methodical');
    expect(user).toContain('focused');
    expect(user).toContain('casual');
  });

  it('user message contains DEPTH section', () => {
    const { user } = buildClassifierPrompt(history);
    expect(user).toContain('DEPTH');
  });

  it('user message contains PRECISION section', () => {
    const { user } = buildClassifierPrompt(history);
    expect(user).toContain('PRECISION');
    expect(user).toContain('very_high');
  });

  it('user message contains PLAYFULNESS section', () => {
    const { user } = buildClassifierPrompt(history);
    expect(user).toContain('PLAYFULNESS');
  });

  it('user message contains the 5-field JSON output template', () => {
    const { user } = buildClassifierPrompt(history);
    expect(user).toContain('"nature"');
    expect(user).toContain('"mood"');
    expect(user).toContain('"depth"');
    expect(user).toContain('"precision"');
    expect(user).toContain('"playfulness"');
  });
});

// ── validateClassifierResponse ─────────────────────────────────────────────────

describe('validateClassifierResponse', () => {
  it('returns a valid UserProfile for a fully correct response', () => {
    const result = validateClassifierResponse(makeValidRaw(), null);
    expect(result).not.toBeNull();
    expect(result!.nature).toBe('hardcore_pro');
    expect(result!.mood).toBe('focused');
    expect(result!.depth).toBe('high');
    expect(result!.precisionOrdinal).toBe('very_high');
    expect(result!.playfulnessOrdinal).toBe('low');
  });

  it('derives numeric scores correctly from valid response', () => {
    const result = validateClassifierResponse(makeValidRaw(), null);
    expect(result!.precisionScore).toBe(9.0);
    expect(result!.playfulnessScore).toBe(2.0);
    expect(result!.depthScore).toBe(3.0);
  });

  it('returns null for completely malformed JSON', () => {
    expect(validateClassifierResponse('not json at all', null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(validateClassifierResponse('', null)).toBeNull();
  });

  it('strips markdown fencing before parsing', () => {
    const fenced = '```json\n' + makeValidRaw() + '\n```';
    const result = validateClassifierResponse(fenced, null);
    expect(result).not.toBeNull();
    expect(result!.nature).toBe('hardcore_pro');
  });

  it('invalid nature → falls back to existing nature, keeps other valid fields', () => {
    const existing = makeExistingProfile({ nature: 'pro_geek_soul' });
    const raw = makeValidRaw({ nature: 'unknown_nature' });
    const result = validateClassifierResponse(raw, existing);
    expect(result).not.toBeNull();
    expect(result!.nature).toBe('pro_geek_soul');
    expect(result!.mood).toBe('focused');
  });

  it('invalid nature with no existing → falls back to default beginner', () => {
    const raw = makeValidRaw({ nature: 'bad_value' });
    const result = validateClassifierResponse(raw, null);
    expect(result).not.toBeNull();
    expect(result!.nature).toBe('beginner');
  });

  it('invalid mood → falls back to existing mood', () => {
    const existing = makeExistingProfile({ mood: 'methodical' });
    const raw = makeValidRaw({ mood: 'angry' });
    const result = validateClassifierResponse(raw, existing);
    expect(result!.mood).toBe('methodical');
  });

  it('invalid mood with no existing → falls back to default casual', () => {
    const raw = makeValidRaw({ mood: 'angry' });
    const result = validateClassifierResponse(raw, null);
    expect(result!.mood).toBe('casual');
  });

  it('invalid depth → falls back to existing depth', () => {
    const existing = makeExistingProfile({ depth: 'low', depthScore: 0.1 });
    const raw = makeValidRaw({ depth: 'extreme' });
    const result = validateClassifierResponse(raw, existing);
    expect(result!.depth).toBe('low');
  });

  it('invalid precision → falls back to existing precisionOrdinal', () => {
    const existing = makeExistingProfile({ precisionOrdinal: 'high', precisionScore: 7.0 });
    const raw = makeValidRaw({ precision: 'ultra' });
    const result = validateClassifierResponse(raw, existing);
    expect(result!.precisionOrdinal).toBe('high');
  });

  it('invalid playfulness → falls back to existing playfulnessOrdinal', () => {
    const existing = makeExistingProfile({ playfulnessOrdinal: 'high', playfulnessScore: 7.0 });
    const raw = makeValidRaw({ playfulness: 'super' });
    const result = validateClassifierResponse(raw, existing);
    expect(result!.playfulnessOrdinal).toBe('high');
  });

  it('all fields invalid with no existing → returns safe defaults for all fields', () => {
    const raw = JSON.stringify({ nature: 'x', mood: 'x', depth: 'x', precision: 'x', playfulness: 'x' });
    const result = validateClassifierResponse(raw, null);
    expect(result).not.toBeNull();
    expect(result!.nature).toBe('beginner');
    expect(result!.mood).toBe('casual');
    expect(result!.depth).toBe('medium');
    expect(result!.precisionOrdinal).toBe('medium');
    expect(result!.playfulnessOrdinal).toBe('medium');
  });

  it('accepts all valid nature values', () => {
    for (const nature of ['hardcore_pro', 'pro_geek_soul', 'cool_geek', 'beginner'] as const) {
      const result = validateClassifierResponse(makeValidRaw({ nature }), null);
      expect(result!.nature).toBe(nature);
    }
  });

  it('accepts all valid mood values', () => {
    for (const mood of ['focused', 'excited', 'frustrated', 'casual', 'rushed', 'methodical'] as const) {
      const result = validateClassifierResponse(makeValidRaw({ mood }), null);
      expect(result!.mood).toBe(mood);
    }
  });

  it('accepts all valid depth values', () => {
    for (const depth of ['high', 'medium', 'low'] as const) {
      const result = validateClassifierResponse(makeValidRaw({ depth }), null);
      expect(result!.depth).toBe(depth);
    }
  });

  it('accepts all valid ordinal values for precision', () => {
    for (const precision of ['low', 'medium', 'high', 'very_high'] as const) {
      const result = validateClassifierResponse(makeValidRaw({ precision }), null);
      expect(result!.precisionOrdinal).toBe(precision);
    }
  });

  it('accepts all valid ordinal values for playfulness', () => {
    for (const playfulness of ['low', 'medium', 'high', 'very_high'] as const) {
      const result = validateClassifierResponse(makeValidRaw({ playfulness }), null);
      expect(result!.playfulnessOrdinal).toBe(playfulness);
    }
  });
});

// ── classifyUserProfileLLM — gate and fallback behaviour ──────────────────────

describe('classifyUserProfileLLM', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns existing profile when history.length < MIN_PROFILE_PROMPTS - 1', async () => {
    const existing = makeExistingProfile();
    const mockClient = makeMockOpenAI(makeValidRaw());
    const result = await classifyUserProfileLLM(makeHistory(2), 2, existing, mockClient as never);
    expect(result).toBe(existing);
    expect((mockClient as ReturnType<typeof makeMockOpenAI> & { chat: { completions: { create: ReturnType<typeof vi.fn> } } }).chat.completions.create).not.toHaveBeenCalled();
  });

  it('returns safe defaults when history < MIN and existing is null', async () => {
    const mockClient = makeMockOpenAI(makeValidRaw());
    const result = await classifyUserProfileLLM(makeHistory(2), 2, null, mockClient as never);
    expect(result.nature).toBe('beginner');
    expect(result.mood).toBe('casual');
    expect(result.depth).toBe('medium');
  });

  it('calls LLM when history.length >= MIN_PROFILE_PROMPTS', async () => {
    const mockClient = makeMockOpenAI(makeValidRaw());
    await classifyUserProfileLLM(makeHistory(4), 4, null, mockClient as never);
    const createFn = (mockClient as { chat: { completions: { create: ReturnType<typeof vi.fn> } } }).chat.completions.create;
    expect(createFn).toHaveBeenCalledOnce();
  });

  it('returns valid profile from LLM response', async () => {
    const mockClient = makeMockOpenAI(makeValidRaw());
    const result = await classifyUserProfileLLM(makeHistory(4), 4, null, mockClient as never);
    expect(result.nature).toBe('hardcore_pro');
    expect(result.mood).toBe('focused');
    expect(result.depth).toBe('high');
    expect(result.precisionOrdinal).toBe('very_high');
    expect(result.playfulnessOrdinal).toBe('low');
  });

  it('stamps computedAt with promptCount', async () => {
    const mockClient = makeMockOpenAI(makeValidRaw());
    const result = await classifyUserProfileLLM(makeHistory(6), 6, null, mockClient as never);
    expect(result.computedAt).toBe(6);
  });

  it('returns existing profile on API error', async () => {
    const existing = makeExistingProfile();
    const mockClient = {
      chat: { completions: { create: vi.fn().mockRejectedValue(new Error('network error')) } },
    };
    const result = await classifyUserProfileLLM(makeHistory(4), 4, existing, mockClient as never);
    expect(result).toBe(existing);
  });

  it('returns safe defaults on API error when existing is null', async () => {
    const mockClient = {
      chat: { completions: { create: vi.fn().mockRejectedValue(new Error('timeout')) } },
    };
    const result = await classifyUserProfileLLM(makeHistory(4), 4, null, mockClient as never);
    expect(result.nature).toBe('beginner');
    expect(result.mood).toBe('casual');
  });

  it('returns existing profile when LLM returns malformed JSON', async () => {
    const existing = makeExistingProfile();
    const mockClient = makeMockOpenAI('not valid json');
    const result = await classifyUserProfileLLM(makeHistory(4), 4, existing, mockClient as never);
    expect(result).toBe(existing);
  });

  it('returns safe defaults when LLM returns malformed JSON and existing is null', async () => {
    const mockClient = makeMockOpenAI('not valid json');
    const result = await classifyUserProfileLLM(makeHistory(4), 4, null, mockClient as never);
    expect(result.nature).toBe('beginner');
  });

  it('uses correct model in API call', async () => {
    const mockClient = makeMockOpenAI(makeValidRaw());
    await classifyUserProfileLLM(makeHistory(4), 4, null, mockClient as never);
    const createFn = (mockClient as { chat: { completions: { create: ReturnType<typeof vi.fn> } } }).chat.completions.create;
    expect(createFn.mock.calls[0][0].model).toBe('gpt-4o-mini');
  });

  it('uses temperature 0 in API call', async () => {
    const mockClient = makeMockOpenAI(makeValidRaw());
    await classifyUserProfileLLM(makeHistory(4), 4, null, mockClient as never);
    const createFn = (mockClient as { chat: { completions: { create: ReturnType<typeof vi.fn> } } }).chat.completions.create;
    expect(createFn.mock.calls[0][0].temperature).toBe(0);
  });

  it('uses json_object response_format in API call', async () => {
    const mockClient = makeMockOpenAI(makeValidRaw());
    await classifyUserProfileLLM(makeHistory(4), 4, null, mockClient as never);
    const createFn = (mockClient as { chat: { completions: { create: ReturnType<typeof vi.fn> } } }).chat.completions.create;
    expect(createFn.mock.calls[0][0].response_format).toEqual({ type: 'json_object' });
  });

  it('sends both system and user messages', async () => {
    const mockClient = makeMockOpenAI(makeValidRaw());
    await classifyUserProfileLLM(makeHistory(4), 4, null, mockClient as never);
    const createFn = (mockClient as { chat: { completions: { create: ReturnType<typeof vi.fn> } } }).chat.completions.create;
    const messages = createFn.mock.calls[0][0].messages as { role: string }[];
    expect(messages.some((m) => m.role === 'system')).toBe(true);
    expect(messages.some((m) => m.role === 'user')).toBe(true);
  });

  it('does not throw even when API rejects', async () => {
    const mockClient = {
      chat: { completions: { create: vi.fn().mockRejectedValue(new Error('auth error')) } },
    };
    await expect(
      classifyUserProfileLLM(makeHistory(4), 4, null, mockClient as never),
    ).resolves.not.toThrow();
  });
});

// ── S07 Carlos — regression: senior backend engineer classified correctly ───────
//
// Problem the keyword classifier had: Carlos writes precise technical commands
// (REST endpoints, pagination, concurrent access, unit tests) whose vocabulary
// (REST, API, CRUD, GET, HTTP) matched the allCaps/acronym heuristic and scored
// below the precision threshold → classified as beginner.
// The LLM classifier must correctly identify him as hardcore_pro / high / focused.

describe('LLMProfileClassifier — S07 Carlos regression', () => {
  const CARLOS_PROMPTS: PromptRecord[] = [
    { index: 0, text: 'Add pagination to GET /vehicles — support page and limit query params, return total count in response headers.', capturedAt: 0, classifiedStage: 'implementation', confidence: 0.9 },
    { index: 1, text: 'Write unit tests for the assignment constraint — handle concurrent access and verify lock behaviour under load.', capturedAt: 0, classifiedStage: 'implementation', confidence: 0.9 },
    { index: 2, text: 'Add an index on vehicles.status — query is doing a full table scan on the 2M row table.', capturedAt: 0, classifiedStage: 'implementation', confidence: 0.9 },
    { index: 3, text: 'Refactor the auth middleware — extract token validation into its own module, add unit tests, keep the interface stable.', capturedAt: 0, classifiedStage: 'implementation', confidence: 0.9 },
    { index: 4, text: 'Add rate limiting to POST /bookings — 10 requests per minute per user, return 429 with Retry-After header.', capturedAt: 0, classifiedStage: 'implementation', confidence: 0.9 },
    { index: 5, text: 'Wire up the error handler — catch unhandled promise rejections, log with request ID, return RFC 7807 problem JSON.', capturedAt: 0, classifiedStage: 'implementation', confidence: 0.9 },
  ];

  // The LLM response the mock returns — what a well-prompted LLM should output for Carlos
  const CARLOS_LLM_RESPONSE = JSON.stringify({
    nature:      'hardcore_pro',
    mood:        'focused',
    depth:       'high',
    precision:   'high',
    playfulness: 'low',
  });

  it('buildClassifierPrompt includes hardcore_pro examples that match Carlos-style vocabulary', () => {
    const { user } = buildClassifierPrompt(CARLOS_PROMPTS);
    // Nature guide must include the examples that distinguish hardcore_pro from beginner
    expect(user).toContain('hardcore_pro');
    expect(user).toContain('pagination');   // example in the nature guide matches Carlos's domain
    expect(user).toContain('concurrent');   // concurrent access example in the nature guide
    // All 6 Carlos prompts must appear in the numbered input section
    expect(user).toContain('GET /vehicles');
    expect(user).toContain('concurrent access');
    expect(user).toContain('rate limiting');
  });

  it('validateClassifierResponse maps Carlos LLM output to correct UserProfile fields', () => {
    const profile = validateClassifierResponse(CARLOS_LLM_RESPONSE, null);
    expect(profile).not.toBeNull();
    expect(profile!.nature).toBe('hardcore_pro');
    expect(profile!.mood).toBe('focused');
    expect(profile!.depth).toBe('high');
    expect(profile!.precisionOrdinal).toBe('high');
    expect(profile!.playfulnessOrdinal).toBe('low');
  });

  it('Carlos profile has correct derived scores — precision:high→7.0, playfulness:low→2.0, depth:high→3.0', () => {
    const profile = validateClassifierResponse(CARLOS_LLM_RESPONSE, null);
    expect(profile!.precisionScore).toBe(7.0);
    expect(profile!.playfulnessScore).toBe(2.0);
    expect(profile!.depthScore).toBe(3.0);
  });

  it('full classifyUserProfileLLM call with Carlos prompts and mock client returns correct profile', async () => {
    const mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: CARLOS_LLM_RESPONSE } }],
          }),
        },
      },
    };
    const profile = await classifyUserProfileLLM(CARLOS_PROMPTS, 6, null, mockClient as never);
    expect(profile.nature).toBe('hardcore_pro');
    expect(profile.mood).toBe('focused');
    expect(profile.depth).toBe('high');
    expect(profile.precisionScore).toBe(7.0);
    expect(profile.playfulnessScore).toBe(2.0);
    expect(profile.depthScore).toBe(3.0);
    expect(profile.computedAt).toBe(6);
  });
});
