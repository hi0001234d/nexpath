import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import type { Stage, UserProfile } from './types.js';
import { classifyPrompt } from './PromptClassifier.js';
import type { StageClassifierInput } from './stage-classifier.js';
import {
  STAGE_CLASSIFIER_SYSTEM_PROMPT,
  STAGE_CLASSIFIER_MODEL,
  classifyStage,
  parseStageClassifierReply,
  buildStageClassifierUserMessage,
  applyReleaseGuard,
} from './stage-classifier.js';
import type { StageClassifierResult } from './stage-classifier.js';

// A mock chat client that returns `content` and (optionally) captures the request.
function mockClient(content: string, capture?: (req: { model: string; messages: { role: string; content: string }[] }) => void): OpenAI {
  return {
    chat: { completions: { create: async (req: { model: string; messages: { role: string; content: string }[] }) => {
      capture?.(req);
      return { choices: [{ message: { content } }] };
    } } },
  } as unknown as OpenAI;
}
function throwingClient(): OpenAI {
  return { chat: { completions: { create: async () => { throw new Error('api down'); } } } } as unknown as OpenAI;
}
function input(promptText = 'do the thing', sessionStage: Stage = 'implementation'): StageClassifierInput {
  return { promptText, window: [{ text: promptText }], sessionStage, sessionConfidence: 0.5, profile: null };
}
const REPLY_BASE = { stage_confidence: 0.9, signals_present: [] as string[], signals_absent: [] as string[], fire_decision_session: false, selected_signal_key: '', reason: 'r' };

describe('stage-classifier — reply parsing + label mapping (stage-label parity)', () => {
  it('maps every human stage label back to the enum', () => {
    const cases: [string, Stage][] = [
      ['Idea', 'idea'], ['PRD/Spec', 'prd'], ['Architecture', 'architecture'],
      ['Task Breakdown', 'task_breakdown'], ['Implementation', 'implementation'],
      ['Review/Testing', 'review_testing'], ['Release', 'release'], ['Feedback Loop', 'feedback_loop'],
    ];
    for (const [label, stage] of cases) {
      expect(parseStageClassifierReply(JSON.stringify({ ...REPLY_BASE, stage: label })).stage).toBe(stage);
    }
  });

  it('throws on an unknown stage label', () => {
    expect(() => parseStageClassifierReply(JSON.stringify({ ...REPLY_BASE, stage: 'Deploying' }))).toThrow();
  });

  it('throws on a missing required field', () => {
    const { reason: _omit, ...noReason } = { ...REPLY_BASE, stage: 'Idea' };
    expect(() => parseStageClassifierReply(JSON.stringify(noReason))).toThrow();
  });

  it('strips markdown fences before parsing', () => {
    const fenced = '```json\n' + JSON.stringify({ ...REPLY_BASE, stage: 'Idea' }) + '\n```';
    expect(parseStageClassifierReply(fenced).stage).toBe('idea');
  });

  it('low confidence forces fire=false even when the model says true', () => {
    const low = parseStageClassifierReply(JSON.stringify({ ...REPLY_BASE, stage: 'Release', stage_confidence: 0.2, fire_decision_session: true }));
    expect(low.fireRecommendation).toBe(false);
    const high = parseStageClassifierReply(JSON.stringify({ ...REPLY_BASE, stage: 'Release', stage_confidence: 0.9, fire_decision_session: true }));
    expect(high.fireRecommendation).toBe(true);
  });

  it('carries the signal assessment + selected key through', () => {
    const p = parseStageClassifierReply(JSON.stringify({ ...REPLY_BASE, stage: 'Implementation', signals_present: ['a'], signals_absent: ['b', 'c'], fire_decision_session: true, selected_signal_key: 'b' }));
    expect(p.signalsPresent).toEqual(['a']);
    expect(p.signalsAbsent).toEqual(['b', 'c']);
    expect(p.selectedSignalKey).toBe('b');
    expect(p.fireRecommendation).toBe(true);
  });
});

describe('stage-classifier — one call, cacheable system prompt', () => {
  it('sends a stable system message + a dynamic user message and returns the parsed result', async () => {
    let sent: { model: string; messages: { role: string; content: string }[] } | undefined;
    const client = mockClient(
      JSON.stringify({ stage: 'Release', stage_confidence: 0.9, signals_present: ['x'], signals_absent: ['y'], fire_decision_session: true, selected_signal_key: 'y', reason: 'r' }),
      (req) => { sent = req; },
    );
    const out = await classifyStage(input('deploy this after tests pass'), client);
    expect(out.degraded).toBe(false);
    expect(out.classification.stage).toBe('release');
    expect(out.classification.confidence).toBe(0.9);
    expect(out.fireRecommendation).toBe(true);
    expect(out.selectedSignalKey).toBe('y');
    // Prefix-cache lever: message[0] is the exact stable constant; dynamic content is in the user message.
    expect(sent!.model).toBe(STAGE_CLASSIFIER_MODEL);
    expect(sent!.messages[0].role).toBe('system');
    expect(sent!.messages[0].content).toBe(STAGE_CLASSIFIER_SYSTEM_PROMPT);
    expect(sent!.messages[1].role).toBe('user');
    expect(sent!.messages[1].content).toContain('deploy this after tests pass');
  });
});

describe('stage-classifier — degrade path (model unavailable)', () => {
  it('falls back to the local cascade and never fires when the API throws', async () => {
    const text = 'deploy the service to production now';
    const expected = await classifyPrompt(text);
    const out = await classifyStage(input(text), throwingClient());
    expect(out.degraded).toBe(true);
    expect(out.classification.stage).toBe(expected.stage);
    expect(out.classification.confidence).toBe(expected.confidence);
    expect(out.fireRecommendation).toBe(false);
    expect(out.selectedSignalKey).toBe('');
  });

  it('degrades on an empty reply and on an unparseable reply', async () => {
    const empty = await classifyStage(input('write unit tests'), mockClient(''));
    expect(empty.degraded).toBe(true);
    const garbage = await classifyStage(input('write unit tests'), mockClient('not json at all'));
    expect(garbage.degraded).toBe(true);
    expect(garbage.fireRecommendation).toBe(false);
  });
});

describe('stage-classifier — system prompt encodes the hardening requirements', () => {
  it('carries verb-mood awareness, scaffolding suppression, and the release verification-token guard', () => {
    expect(STAGE_CLASSIFIER_SYSTEM_PROMPT).toMatch(/VERB-MOOD AWARENESS/);
    expect(STAGE_CLASSIFIER_SYSTEM_PROMPT).toMatch(/SCAFFOLDING/);
    expect(STAGE_CLASSIFIER_SYSTEM_PROMPT).toMatch(/DO NOT classify\s+as Release/i);
    expect(STAGE_CLASSIFIER_SYSTEM_PROMPT).toMatch(/VERIFICATION-TOKEN GUARD FOR RELEASE/);
    expect(STAGE_CLASSIFIER_SYSTEM_PROMPT).toMatch(/NOT sufficient for Release/i);
  });

  it('instructs that an init/scaffold window naming production deps is NOT a release', () => {
    expect(STAGE_CLASSIFIER_SYSTEM_PROMPT).toMatch(/npm init/);
    expect(STAGE_CLASSIFIER_SYSTEM_PROMPT).toMatch(/regardless of which production dependencies/i);
  });

  it('lists all 8 stages', () => {
    for (const label of ['Idea', 'PRD/Spec', 'Architecture', 'Task Breakdown', 'Implementation', 'Review/Testing', 'Release', 'Feedback Loop']) {
      expect(STAGE_CLASSIFIER_SYSTEM_PROMPT).toContain(label);
    }
  });

  it('carries the feedback-loop live-evidence boundary and the add-feature implementation rule', () => {
    expect(STAGE_CLASSIFIER_SYSTEM_PROMPT).toMatch(/FEEDBACK-LOOP BOUNDARY/);
    expect(STAGE_CLASSIFIER_SYSTEM_PROMPT).toMatch(/NOT live evidence/i);
    expect(STAGE_CLASSIFIER_SYSTEM_PROMPT).toMatch(/ADD-FEATURE REQUESTS/);
    expect(STAGE_CLASSIFIER_SYSTEM_PROMPT).toMatch(/without asking for the build itself/i);
  });
});

describe('stage-classifier — deterministic release guard (scaffolding without a verification token is never a release)', () => {
  function releaseResult(): StageClassifierResult {
    return {
      classification: { stage: 'release', confidence: 0.9, tier: 3, allScores: { release: 0.9 } },
      signalsPresent: [], signalsAbsent: [], fireRecommendation: true, selectedSignalKey: '', reason: 'r', degraded: false,
    };
  }

  it('neutralises a release for an init/scaffold window lacking a verification token', () => {
    const guarded = applyReleaseGuard(releaseResult(), 'set up the project with docker and a ci/cd pipeline');
    expect(guarded.classification.confidence).toBe(0);   // transition blocked upstream
    expect(guarded.fireRecommendation).toBe(false);      // no advisory fires
  });

  it('leaves a genuine release (scaffolding present but a verification token too) untouched', () => {
    const guarded = applyReleaseGuard(releaseResult(), 'scaffold is done — now deploy to production after tests pass');
    expect(guarded.classification.confidence).toBe(0.9);
    expect(guarded.fireRecommendation).toBe(true);
  });

  it('does not touch a non-release stage even in a scaffold window', () => {
    const impl: StageClassifierResult = { ...releaseResult(), classification: { stage: 'implementation', confidence: 0.8, tier: 3, allScores: { implementation: 0.8 } } };
    expect(applyReleaseGuard(impl, 'scaffold a new project').classification.confidence).toBe(0.8);
  });

  it('applies through classifyStage on the model path', async () => {
    const client = mockClient(JSON.stringify({ stage: 'Release', stage_confidence: 0.95, signals_present: [], signals_absent: [], fire_decision_session: true, selected_signal_key: '', reason: 'r' }));
    const out = await classifyStage(input('bootstrap a new project and wire up the ci/cd pipeline', 'idea'), client);
    expect(out.classification.stage).toBe('release');
    expect(out.classification.confidence).toBe(0);
    expect(out.fireRecommendation).toBe(false);
  });
});

describe('stage-classifier — user message', () => {
  it('includes the recent window, the stage-calibration line, the all-stages signal list, and a null-profile block', () => {
    const msg = buildStageClassifierUserMessage({
      promptText: 'p3', window: [{ text: 'p1' }, { text: 'p2' }, { text: 'p3' }],
      sessionStage: 'implementation', sessionConfidence: 0.42, profile: null,
    });
    expect(msg).toContain('[1] p1');
    expect(msg).toContain('[3] p3');
    expect(msg).toContain('Stage calibration:');
    expect(msg).toContain('not yet computed');
    expect(msg).toContain('Signals to check (across ALL stages):');
  });

  it('never asserts the session stage as current truth, and shows other stages\' signals (anchor-lock regression)', () => {
    // Asserting "Current stage: X" made the model CONFIRM that stage instead of
    // classifying the prompts — sessions start at idea and locked there.
    const msg = buildStageClassifierUserMessage({
      promptText: 'x', window: [{ text: 'x' }], sessionStage: 'idea', sessionConfidence: 0.5, profile: null,
    });
    expect(msg).not.toContain('- Current stage:');
    expect(msg).not.toContain('Current stage confidence');
    // With the session at idea, the checklist must still show build-stage signals —
    // scoping it to the session stage starved the model of transition evidence.
    expect(msg).toContain('test_creation:');
    expect(msg).toContain('idea_scoping:');
  });

  it('renders the profile calibration block when a profile is present', () => {
    const profile = { nature: 'beginner', depth: 'shallow', mood: 'focused' } as unknown as UserProfile;
    const msg = buildStageClassifierUserMessage({
      promptText: 'x', window: [{ text: 'x' }], sessionStage: 'idea', sessionConfidence: 0.1, profile,
    });
    expect(msg).toContain('Nature: beginner');
    expect(msg).toContain('non-technical');
  });
});
