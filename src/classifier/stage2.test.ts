import { describe, it, expect, vi } from 'vitest';
import type { SessionState, AbsenceFlag } from './types.js';
import {
  buildSignalList,
  buildStage2Prompt,
  shouldFireStage2,
  parseStage2Response,
  runStage2,
  STAGE2_CONTEXT_WINDOW,
  STAGE2_LLM_MIN_CONFIDENCE,
  STAGE2_MODEL,
  STAGE_LABEL,
  STAGE_FROM_LABEL,
} from './Stage2Trigger.js';
import type { Stage2Input } from './Stage2Trigger.js';
import type OpenAI from 'openai';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePromptRecord(text: string, index: number) {
  return {
    index,
    text,
    capturedAt: Date.now(),
    classifiedStage: 'implementation' as const,
    confidence: 0.8,
  };
}

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId:              'test-session',
    projectRoot:            '/test/project',
    startedAt:              Date.now(),
    lastPromptAt:           Date.now(),
    currentStage:           'implementation',
    stageConfidence:        0.85,
    stageConfirmedAt:       5,
    promptsInCurrentStage:  20,
    promptCount:            20,
    promptHistory:          Array.from({ length: 15 }, (_, i) =>
      makePromptRecord(`implement the auth module step ${i + 1}`, i),
    ),
    signalCounters:         {},
    absenceFlags:           [],
    firedDecisionSessions:  [],
    profile:                null,
    detectedLanguage:       undefined,
    ...overrides,
  };
}

function makeStage2Input(overrides: Partial<Stage2Input> = {}): Stage2Input {
  return {
    state:         makeState(),
    detectedStage: 'implementation',
    confidence:    0.85,
    flagType:      'stage_transition',
    ...overrides,
  };
}

const VALID_LLM_RESPONSE = {
  stage:                 'Implementation',
  stage_confidence:      0.88,
  signals_present:       ['test_creation'],
  signals_absent:        ['security_check'],
  fire_decision_session: true,
  reason:                'Developer moved from architecture to implementation without testing signals.',
};

// ── STAGE_LABEL / STAGE_FROM_LABEL ────────────────────────────────────────────

describe('STAGE_LABEL and STAGE_FROM_LABEL', () => {
  it('covers all 8 stages', () => {
    const stages = ['idea', 'prd', 'architecture', 'task_breakdown', 'implementation', 'review_testing', 'release', 'feedback_loop'];
    for (const s of stages) {
      expect(STAGE_LABEL).toHaveProperty(s);
    }
  });

  it('STAGE_FROM_LABEL reverses STAGE_LABEL correctly', () => {
    for (const [k, v] of Object.entries(STAGE_LABEL)) {
      expect(STAGE_FROM_LABEL[v]).toBe(k);
    }
  });

  it('STAGE2_MODEL is gpt-4o-mini', () => {
    expect(STAGE2_MODEL).toBe('gpt-4o-mini');
  });

  it('STAGE2_CONTEXT_WINDOW is 10', () => {
    expect(STAGE2_CONTEXT_WINDOW).toBe(10);
  });

  it('STAGE2_LLM_MIN_CONFIDENCE is 0.60', () => {
    expect(STAGE2_LLM_MIN_CONFIDENCE).toBe(0.60);
  });
});

// ── buildSignalList ───────────────────────────────────────────────────────────

describe('buildSignalList', () => {
  it('returns non-empty string for implementation stage', () => {
    const result = buildSignalList('implementation');
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes signals expected in the given stage', () => {
    const result = buildSignalList('implementation');
    // test_creation is expected in 'implementation'
    expect(result).toContain('test_creation');
    expect(result).toContain('security_check');
  });

  it('excludes signals not expected in the stage', () => {
    // rollback_planning is expected in 'release' only
    const result = buildSignalList('implementation');
    expect(result).not.toContain('rollback_planning');
  });

  it('returns different signal sets for different stages', () => {
    const impl   = buildSignalList('implementation');
    const release = buildSignalList('release');
    expect(impl).not.toBe(release);
  });

  it('includes signal key and description on each line', () => {
    const result = buildSignalList('implementation');
    // Each line should be "key: description"
    const lines = result.split('\n').filter(Boolean);
    for (const line of lines) {
      expect(line).toContain(':');
    }
  });
});

// ── buildStage2Prompt ─────────────────────────────────────────────────────────

describe('buildStage2Prompt', () => {
  it('contains the detected stage label', () => {
    const input = makeStage2Input({ detectedStage: 'implementation' });
    const prompt = buildStage2Prompt(input);
    expect(prompt).toContain('Implementation');
  });

  it('contains the flag type', () => {
    const input = makeStage2Input({ flagType: 'stage_transition' });
    const prompt = buildStage2Prompt(input);
    expect(prompt).toContain('stage_transition');
  });

  it('contains the absence flag type with signal name', () => {
    const input = makeStage2Input({ flagType: 'absence:test_creation' });
    const prompt = buildStage2Prompt(input);
    expect(prompt).toContain('absence:test_creation');
  });

  it('contains classifier confidence formatted to 2 decimal places', () => {
    const input = makeStage2Input({ confidence: 0.8500 });
    const prompt = buildStage2Prompt(input);
    expect(prompt).toContain('0.85');
  });

  it('includes recent prompts in numbered format', () => {
    const input = makeStage2Input();
    const prompt = buildStage2Prompt(input);
    expect(prompt).toContain('[1]');
    expect(prompt).toContain('[2]');
  });

  it('limits context to last STAGE2_CONTEXT_WINDOW (10) prompts', () => {
    // State has 15 prompts; only last 10 should appear
    const input = makeStage2Input();
    const prompt = buildStage2Prompt(input);
    // Should have [1]...[10] but not [11]
    expect(prompt).toContain('[10]');
    expect(prompt).not.toContain('[11]');
  });

  it('includes all stage options', () => {
    const input = makeStage2Input();
    const prompt = buildStage2Prompt(input);
    expect(prompt).toContain('Idea');
    expect(prompt).toContain('PRD/Spec');
    expect(prompt).toContain('Architecture');
    expect(prompt).toContain('Implementation');
    expect(prompt).toContain('Review/Testing');
    expect(prompt).toContain('Release');
    expect(prompt).toContain('Feedback Loop');
  });

  it('includes the JSON template in the prompt', () => {
    const input = makeStage2Input();
    const prompt = buildStage2Prompt(input);
    expect(prompt).toContain('fire_decision_session');
    expect(prompt).toContain('signals_present');
    expect(prompt).toContain('signals_absent');
    expect(prompt).toContain('stage_confidence');
  });

  it('includes signal list for the detected stage', () => {
    const input = makeStage2Input({ detectedStage: 'implementation' });
    const prompt = buildStage2Prompt(input);
    expect(prompt).toContain('test_creation');
  });

  it('works with only 1 prompt in history', () => {
    const state = makeState({ promptHistory: [makePromptRecord('one prompt', 0)] });
    const input = makeStage2Input({ state });
    const prompt = buildStage2Prompt(input);
    expect(prompt).toContain('[1]');
    expect(prompt).toContain('one prompt');
  });

  it('shows correct count in "Last N developer prompts" line', () => {
    // History has 15 prompts but context window is 10
    const input = makeStage2Input();
    const prompt = buildStage2Prompt(input);
    expect(prompt).toContain('Last 10 developer prompts');
  });

  it('includes beginner calibration note when profile.nature=beginner', () => {
    const state = makeState({ profile: {
      nature: 'beginner', precisionScore: 1, playfulnessScore: 1,
      mood: 'casual', depth: 'low', depthScore: 1, computedAt: 1,
    }});
    const prompt = buildStage2Prompt(makeStage2Input({ state }));
    expect(prompt).toContain('non-technical');
    expect(prompt).toContain('Calibration:');
  });

  it('includes experienced engineer note when profile.nature=hardcore_pro', () => {
    const state = makeState({ profile: {
      nature: 'hardcore_pro', precisionScore: 9, playfulnessScore: 2,
      mood: 'focused', depth: 'high', depthScore: 8, computedAt: 1,
    }});
    const prompt = buildStage2Prompt(makeStage2Input({ state }));
    expect(prompt).toContain('experienced engineer');
    expect(prompt).toContain('Calibration:');
  });

  it('includes "not yet computed" fallback when profile=null', () => {
    const state = makeState({ profile: null });
    const prompt = buildStage2Prompt(makeStage2Input({ state }));
    expect(prompt).toContain('not yet computed');
  });

  it('profile block appears before "Signals to check" in all cases', () => {
    const stateWithProfile = makeState({ profile: {
      nature: 'beginner', precisionScore: 1, playfulnessScore: 1,
      mood: 'casual', depth: 'low', depthScore: 1, computedAt: 1,
    }});
    const stateNullProfile = makeState({ profile: null });
    for (const state of [stateWithProfile, stateNullProfile]) {
      const prompt = buildStage2Prompt(makeStage2Input({ state }));
      const profileIdx = prompt.indexOf('Developer profile');
      const signalsIdx = prompt.indexOf('Signals to check');
      expect(profileIdx).toBeGreaterThan(-1);
      expect(signalsIdx).toBeGreaterThan(-1);
      expect(profileIdx).toBeLessThan(signalsIdx);
    }
  });
});

// ── shouldFireStage2 ──────────────────────────────────────────────────────────

describe('shouldFireStage2', () => {
  it('returns stage_transition when stage changed', () => {
    const state = makeState({ currentStage: 'implementation' });
    const result = shouldFireStage2(state, 'architecture', []);
    expect(result).toBe('stage_transition');
  });

  it('returns null when stage is the same (no transition)', () => {
    const state = makeState({ currentStage: 'implementation' });
    const result = shouldFireStage2(state, 'implementation', []);
    expect(result).toBeNull();
  });

  it('returns null when prevStage is undefined (no prior stage)', () => {
    const state = makeState({ currentStage: 'implementation' });
    const result = shouldFireStage2(state, undefined, []);
    expect(result).toBeNull();
  });

  it('returns absence:<signalKey> when a new absence flag is raised', () => {
    const state = makeState({ currentStage: 'implementation' });
    const flag: AbsenceFlag = {
      signalKey:     'test_creation',
      stage:         'implementation',
      raisedAtIndex: 20,
      cooldownUntil: 50,
    };
    const result = shouldFireStage2(state, undefined, [flag]);
    expect(result).toBe('absence:test_creation');
  });

  it('returns first flag key when multiple absence flags raised', () => {
    const state = makeState({ currentStage: 'implementation' });
    const flags: AbsenceFlag[] = [
      { signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 20, cooldownUntil: 50 },
      { signalKey: 'security_check', stage: 'implementation', raisedAtIndex: 20, cooldownUntil: 50 },
    ];
    const result = shouldFireStage2(state, undefined, flags);
    expect(result).toBe('absence:test_creation');
  });

  it('returns absence:<signalKey> when low confidence + active absence flag exists', () => {
    const activeFlag: AbsenceFlag = {
      signalKey:     'test_creation',
      stage:         'implementation',
      raisedAtIndex: 10,
      cooldownUntil: 40, // not expired — promptCount=20 < 40
    };
    const state = makeState({
      stageConfidence: 0.40, // < 0.50
      promptCount:     20,
      absenceFlags:    [activeFlag],
    });
    const result = shouldFireStage2(state, undefined, []);
    expect(result).toBe('absence:test_creation');
  });

  it('returns null when low confidence but no active absence flag', () => {
    const state = makeState({
      stageConfidence: 0.40,
      promptCount:     20,
      absenceFlags:    [], // no flags
    });
    const result = shouldFireStage2(state, undefined, []);
    expect(result).toBeNull();
  });

  it('returns null when low confidence + flag in cooldown (expired)', () => {
    const expiredFlag: AbsenceFlag = {
      signalKey:        'test_creation',
      stage:            'implementation',
      raisedAtIndex:    5,
      cooldownUntil:    15, // expired — promptCount=20 >= 15
    };
    const state = makeState({
      stageConfidence: 0.40,
      promptCount:     20,
      absenceFlags:    [expiredFlag],
    });
    const result = shouldFireStage2(state, undefined, []);
    expect(result).toBeNull();
  });

  it('returns null when low confidence + flag already dismissed', () => {
    const dismissedFlag: AbsenceFlag = {
      signalKey:        'test_creation',
      stage:            'implementation',
      raisedAtIndex:    5,
      dismissedAtIndex: 10, // dismissed
      cooldownUntil:    40,
    };
    const state = makeState({
      stageConfidence: 0.40,
      promptCount:     20,
      absenceFlags:    [dismissedFlag],
    });
    const result = shouldFireStage2(state, undefined, []);
    expect(result).toBeNull();
  });

  it('stage transition takes priority over absence flags', () => {
    const flag: AbsenceFlag = {
      signalKey: 'test_creation', stage: 'implementation', raisedAtIndex: 20, cooldownUntil: 50,
    };
    const state = makeState({ currentStage: 'review_testing' });
    const result = shouldFireStage2(state, 'implementation', [flag]);
    // Stage transition fires first
    expect(result).toBe('stage_transition');
  });

  it('high confidence + no flags → null (no Stage 2 needed)', () => {
    const state = makeState({ stageConfidence: 0.90 });
    const result = shouldFireStage2(state, undefined, []);
    expect(result).toBeNull();
  });
});

// ── parseStage2Response ───────────────────────────────────────────────────────

describe('parseStage2Response', () => {
  it('parses a valid JSON response correctly', () => {
    const raw = JSON.stringify(VALID_LLM_RESPONSE);
    const result = parseStage2Response(raw);
    expect(result.stage).toBe('implementation');
    expect(result.stage_confidence).toBe(0.88);
    expect(result.signals_present).toEqual(['test_creation']);
    expect(result.signals_absent).toEqual(['security_check']);
    expect(result.fire_decision_session).toBe(true);
    expect(result.reason).toBe('Developer moved from architecture to implementation without testing signals.');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseStage2Response('not json at all')).toThrow('Stage 2: invalid JSON');
  });

  it('throws when stage field is missing', () => {
    const bad = { ...VALID_LLM_RESPONSE, stage: undefined };
    expect(() => parseStage2Response(JSON.stringify(bad))).toThrow('"stage"');
  });

  it('throws when stage_confidence field is missing', () => {
    const bad = { ...VALID_LLM_RESPONSE, stage_confidence: undefined };
    expect(() => parseStage2Response(JSON.stringify(bad))).toThrow('"stage_confidence"');
  });

  it('throws when signals_present is not an array', () => {
    const bad = { ...VALID_LLM_RESPONSE, signals_present: 'not-array' };
    expect(() => parseStage2Response(JSON.stringify(bad))).toThrow('"signals_present"');
  });

  it('throws when signals_absent is not an array', () => {
    const bad = { ...VALID_LLM_RESPONSE, signals_absent: null };
    expect(() => parseStage2Response(JSON.stringify(bad))).toThrow('"signals_absent"');
  });

  it('throws when fire_decision_session is not a boolean', () => {
    const bad = { ...VALID_LLM_RESPONSE, fire_decision_session: 'yes' };
    expect(() => parseStage2Response(JSON.stringify(bad))).toThrow('"fire_decision_session"');
  });

  it('throws when reason field is missing', () => {
    const bad = { ...VALID_LLM_RESPONSE, reason: undefined };
    expect(() => parseStage2Response(JSON.stringify(bad))).toThrow('"reason"');
  });

  it('throws on unknown stage label', () => {
    const bad = { ...VALID_LLM_RESPONSE, stage: 'UnknownStage' };
    expect(() => parseStage2Response(JSON.stringify(bad))).toThrow('unknown stage label');
  });

  it('overrides fire_decision_session to false when stage_confidence < 0.60', () => {
    const lowConf = { ...VALID_LLM_RESPONSE, stage_confidence: 0.55, fire_decision_session: true };
    const result = parseStage2Response(JSON.stringify(lowConf));
    expect(result.fire_decision_session).toBe(false);
  });

  it('keeps fire_decision_session true when stage_confidence >= 0.60', () => {
    const highConf = { ...VALID_LLM_RESPONSE, stage_confidence: 0.60, fire_decision_session: true };
    const result = parseStage2Response(JSON.stringify(highConf));
    expect(result.fire_decision_session).toBe(true);
  });

  it('keeps fire_decision_session false regardless of confidence', () => {
    const noFire = { ...VALID_LLM_RESPONSE, stage_confidence: 0.95, fire_decision_session: false };
    const result = parseStage2Response(JSON.stringify(noFire));
    expect(result.fire_decision_session).toBe(false);
  });

  it('strips markdown fencing before parsing', () => {
    const fenced = '```json\n' + JSON.stringify(VALID_LLM_RESPONSE) + '\n```';
    const result = parseStage2Response(fenced);
    expect(result.stage).toBe('implementation');
  });

  it('strips markdown fencing without language hint', () => {
    const fenced = '```\n' + JSON.stringify(VALID_LLM_RESPONSE) + '\n```';
    const result = parseStage2Response(fenced);
    expect(result.stage).toBe('implementation');
  });

  it('parses all 8 stage labels correctly', () => {
    const stageTests: Array<[string, string]> = [
      ['Idea', 'idea'],
      ['PRD/Spec', 'prd'],
      ['Architecture', 'architecture'],
      ['Task Breakdown', 'task_breakdown'],
      ['Implementation', 'implementation'],
      ['Review/Testing', 'review_testing'],
      ['Release', 'release'],
      ['Feedback Loop', 'feedback_loop'],
    ];
    for (const [label, expected] of stageTests) {
      const resp = { ...VALID_LLM_RESPONSE, stage: label };
      const result = parseStage2Response(JSON.stringify(resp));
      expect(result.stage).toBe(expected);
    }
  });

  it('accepts empty arrays for signals_present and signals_absent', () => {
    const resp = { ...VALID_LLM_RESPONSE, signals_present: [], signals_absent: [] };
    const result = parseStage2Response(JSON.stringify(resp));
    expect(result.signals_present).toEqual([]);
    expect(result.signals_absent).toEqual([]);
  });
});

// ── runStage2 ─────────────────────────────────────────────────────────────────

describe('runStage2', () => {
  function makeMockClient(content: string): OpenAI {
    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content } }],
          }),
        },
      },
    } as unknown as OpenAI;
  }

  it('calls the OpenAI client and returns parsed Stage2Output', async () => {
    const client = makeMockClient(JSON.stringify(VALID_LLM_RESPONSE));
    const input  = makeStage2Input();
    const result = await runStage2(input, client);

    expect(result.stage).toBe('implementation');
    expect(result.fire_decision_session).toBe(true);
  });

  it('passes the correct model to the OpenAI API', async () => {
    const client = makeMockClient(JSON.stringify(VALID_LLM_RESPONSE));
    const input  = makeStage2Input();
    await runStage2(input, client);

    const createFn = (client.chat.completions.create as ReturnType<typeof vi.fn>);
    expect(createFn).toHaveBeenCalledWith(
      expect.objectContaining({ model: STAGE2_MODEL }),
      expect.anything(),
    );
  });

  it('passes temperature: 0 to the OpenAI API', async () => {
    const client = makeMockClient(JSON.stringify(VALID_LLM_RESPONSE));
    const input  = makeStage2Input();
    await runStage2(input, client);

    const createFn = (client.chat.completions.create as ReturnType<typeof vi.fn>);
    expect(createFn).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0 }),
      expect.anything(),
    );
  });

  it('throws when API returns invalid JSON', async () => {
    const client = makeMockClient('this is not json');
    const input  = makeStage2Input();
    await expect(runStage2(input, client)).rejects.toThrow('Stage 2: invalid JSON');
  });

  it('throws when API returns empty content', async () => {
    const client = makeMockClient('');
    const input  = makeStage2Input();
    await expect(runStage2(input, client)).rejects.toThrow();
  });

  it('throws when API returns a response with missing fields', async () => {
    const incomplete = { stage: 'Implementation', stage_confidence: 0.80 }; // missing other fields
    const client = makeMockClient(JSON.stringify(incomplete));
    const input  = makeStage2Input();
    await expect(runStage2(input, client)).rejects.toThrow('Stage 2:');
  });

  it('propagates API call errors', async () => {
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('network timeout')),
        },
      },
    } as unknown as OpenAI;
    const input = makeStage2Input();
    await expect(runStage2(input, client)).rejects.toThrow('network timeout');
  });

  it('includes the prompt in the API call messages', async () => {
    const client = makeMockClient(JSON.stringify(VALID_LLM_RESPONSE));
    const input  = makeStage2Input();
    await runStage2(input, client);

    const createFn = (client.chat.completions.create as ReturnType<typeof vi.fn>);
    const call = createFn.mock.calls[0][0];
    expect(call.messages[0].role).toBe('user');
    expect(call.messages[0].content).toContain('Implementation');
  });
});
