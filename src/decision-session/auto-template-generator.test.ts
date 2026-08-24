import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import type { RightGoodProfile, RightGoodSignal, RightGoodState } from '../classifier/right-good-aggregator.js';
import {
  topicUniverse,
  signalKeyForTopic,
  classifyTopicPolarity,
  overlapsKnownMistake,
  filterEligibleTopics,
  selectDistinctiveTopics,
  applyCoverageFloor,
  generatePerUserRecord,
  generateAndStoreAutogenRecord,
  buildGenerationPrompt,
  buildPatternSummary,
  persistSelection,
  readSelection,
  selectionComputed,
  isTopicSelected,
  persistPolaritySnapshot,
  markAutogenRefresh,
  autogenRefreshPending,
  runAutogenForFire,
} from './auto-template-generator.js';
import { validateContentTemplateRecord } from './content-template-schema.js';
import { topicAnchorWords } from './content-anchor.js';
import { SHIPPED_CONTENT_TEMPLATES } from './content-template-tooling.js';
import { openStore } from '../store/db.js';
import { getContentTemplate, upsertContentTemplate } from '../store/content-templates.js';
import { autogenCallsThisMonth } from './autogen-budget.js';
import { setConfig } from '../store/config.js';

function rg(state: RightGoodState): RightGoodSignal {
  return { score: 0.5, state, stability: { sessions: 2, occurrences: 5, stable: true }, lastUpdated: 1 };
}
function mockClient(reply: string): OpenAI {
  return { chat: { completions: { create: async () => ({ choices: [{ message: { content: reply } }] }) } } } as unknown as OpenAI;
}
/** A mock whose personalized cell contains the topic's anchor word (so it passes the read gate). */
function anchoredReply(signalType: string): string {
  const anchor = topicAnchorWords(signalType)[0] ?? 'this';
  return JSON.stringify({ option: `personalized ${anchor} option`, whyDesc: `personalized ${anchor} explanation` });
}
function anchoredClient(signalType: string): OpenAI {
  return mockClient(anchoredReply(signalType));
}

describe('auto-template-generator — topic mapping', () => {
  it('the topic universe is every shipped signalType (non-empty)', () => {
    const u = topicUniverse();
    expect(u.length).toBeGreaterThan(100);
    expect(u).toContain('ABSENCE_TEST_CREATION');
    expect(u).toContain('IDEA_TO_PRD');
  });

  it('maps an absence topic to its signal key; non-absence topics have none', () => {
    expect(signalKeyForTopic('ABSENCE_TEST_CREATION')).toBe('test_creation');
    expect(signalKeyForTopic('IDEA_TO_PRD')).toBeNull();
  });
});

describe('auto-template-generator — polarity + eligibility (filter + overlap)', () => {
  const profile: RightGoodProfile = {
    test_creation: rg('right_good'),
    documentation: rg('mistake'),
    decision_fatigue_pattern: rg('neutral'),
  };

  it('classifies right/good, mistake, neutral, and non-absence topics', () => {
    expect(classifyTopicPolarity('ABSENCE_TEST_CREATION', profile)).toBe('good');
    expect(classifyTopicPolarity('ABSENCE_DOCUMENTATION', profile)).toBe('bad');
    expect(classifyTopicPolarity('ABSENCE_DECISION_FATIGUE_PATTERN', profile)).toBe('in_between');
    expect(classifyTopicPolarity('ABSENCE_UNSEEN_TOPIC', profile)).toBe('in_between'); // absent from profile → neutral
    expect(classifyTopicPolarity('IDEA_TO_PRD', profile)).toBe('in_between'); // non-absence
  });

  it('flags a neutral topic that overlaps a (−) anti-pattern', () => {
    expect(overlapsKnownMistake('ABSENCE_DECISION_FATIGUE_PATTERN')).toBe(true);
    expect(overlapsKnownMistake('ABSENCE_TEST_CREATION')).toBe(false);
    expect(overlapsKnownMistake('IDEA_TO_PRD')).toBe(false);
  });

  it('keeps good + safe-neutral topics, drops mistake-mapped and anti-pattern-overlapping ones', () => {
    const universe = ['ABSENCE_TEST_CREATION', 'ABSENCE_DOCUMENTATION', 'ABSENCE_DECISION_FATIGUE_PATTERN', 'IDEA_TO_PRD'];
    expect(filterEligibleTopics(universe, profile)).toEqual(['ABSENCE_TEST_CREATION', 'IDEA_TO_PRD']);
  });

  it('drops every topic when all map to mistakes (nothing eligible)', () => {
    const universe = ['ABSENCE_TEST_CREATION', 'ABSENCE_DOCUMENTATION'];
    const allBad: RightGoodProfile = { test_creation: rg('mistake'), documentation: rg('mistake') };
    expect(filterEligibleTopics(universe, allBad)).toEqual([]);
  });
});

describe('auto-template-generator — selection call (mocked)', () => {
  const profile: RightGoodProfile = { test_creation: rg('right_good') };

  it('returns ranked eligible topics; drops unknown topics and clamps confidence', async () => {
    const client = mockClient(JSON.stringify({
      topics: [
        { signalType: 'ABSENCE_TEST_CREATION', confidence: 0.9 },
        { signalType: 'TOTALLY_NOT_A_TOPIC', confidence: 0.8 }, // not in the universe → dropped
        { signalType: 'IDEA_TO_PRD', confidence: 1.5 },         // clamped to 1
      ],
    }));
    const out = await selectDistinctiveTopics({ rightGood: profile, patternSummary: 'summary' }, client);
    const byType = Object.fromEntries(out.map((t) => [t.signalType, t.confidence]));
    expect(byType['ABSENCE_TEST_CREATION']).toBe(0.9);
    expect(byType['IDEA_TO_PRD']).toBe(1);
    expect(byType['TOTALLY_NOT_A_TOPIC']).toBeUndefined();
  });

  it('returns [] on a malformed model reply (fail-open)', async () => {
    const out = await selectDistinctiveTopics({ rightGood: profile, patternSummary: 'x' }, mockClient('not json'));
    expect(out).toEqual([]);
  });

  it('returns [] when the model selects no topics', async () => {
    const out = await selectDistinctiveTopics({ rightGood: profile, patternSummary: 'x' }, mockClient(JSON.stringify({ topics: [] })));
    expect(out).toEqual([]);
  });
});

describe('auto-template-generator — coverage floor (scale-to-confident)', () => {
  const ranked = [
    { signalType: 'A', confidence: 0.9 },
    { signalType: 'B', confidence: 0.5 },
    { signalType: 'C', confidence: 0.7 },
  ];

  it('keeps topics clearing the bar, most-confident first', () => {
    expect(applyCoverageFloor(ranked, true, 0.6)).toEqual([
      { signalType: 'A', confidence: 0.9 },
      { signalType: 'C', confidence: 0.7 },
    ]);
  });

  it('personalizes nothing for a no-history project', () => {
    expect(applyCoverageFloor(ranked, false, 0.6)).toEqual([]);
  });

  it('does not pad below-bar topics to reach the target', () => {
    expect(applyCoverageFloor([{ signalType: 'X', confidence: 0.3 }], true, 0.6)).toEqual([]);
  });
});

describe('auto-template-generator — per-topic generation', () => {
  const okClient = anchoredClient('ABSENCE_TEST_CREATION');
  const testAnchor = topicAnchorWords('ABSENCE_TEST_CREATION')[0];

  it('produces a schema-valid, preset-seeded sparse record with source=autogen', async () => {
    const rec = await generatePerUserRecord('ABSENCE_TEST_CREATION', 3, 'summary', okClient);
    expect(rec).not.toBeNull();
    expect(rec!.source).toBe('autogen');
    expect(rec!.levelForms[1]).toBeDefined();                    // mandatory floor inherited from the preset
    expect(rec!.levelForms[3]?.cell.option).toContain(testAnchor); // current column personalized, anchor kept
    expect(validateContentTemplateRecord(rec!).ok).toBe(true);
  });

  it('at level 1 the personalized cell IS the floor (single-entry map)', async () => {
    const rec = await generatePerUserRecord('ABSENCE_TEST_CREATION', 1, 'x', okClient);
    expect(Object.keys(rec!.levelForms)).toEqual(['1']);
    expect(rec!.levelForms[1]?.cell.whyDesc).toContain(testAnchor);
  });

  it('inherits the sensitive-action safeguard from the preset (a sensitive topic stays guarded)', async () => {
    const sensitive = SHIPPED_CONTENT_TEMPLATES.find(
      (r) => r.l2SafeguardRequired && r.l2SafeguardLine && topicAnchorWords(r.signalType).length > 0,
    )!;
    const rec = await generatePerUserRecord(sensitive.signalType, 3, 'x', anchoredClient(sensitive.signalType));
    expect(rec!.l2SafeguardRequired).toBe(true);
    expect(rec!.l2SafeguardLine).toBe(sensitive.l2SafeguardLine);
  });

  it('sanitizes prompt-derived leakage out of the generated cell (C4 gate)', async () => {
    const leaky = mockClient(JSON.stringify({ option: `ping me at alice@corp.com about the ${testAnchor}`, whyDesc: `ok ${testAnchor}` }));
    const rec = await generatePerUserRecord('ABSENCE_TEST_CREATION', 1, 'x', leaky);
    expect(rec!.levelForms[1]?.cell.option).not.toContain('alice@corp.com');
    expect(rec!.levelForms[1]?.cell.option).toMatch(/redacted/i);
  });

  it('returns null for a missing preset, a malformed reply, or an empty cell', async () => {
    expect(await generatePerUserRecord('NOT_A_REAL_TOPIC', 1, 'x', okClient)).toBeNull();
    expect(await generatePerUserRecord('ABSENCE_TEST_CREATION', 1, 'x', mockClient('not json'))).toBeNull();
    expect(await generatePerUserRecord('ABSENCE_TEST_CREATION', 1, 'x', mockClient(JSON.stringify({ option: '', whyDesc: '' })))).toBeNull();
  });

  it('rejects a personalization that drops the topic anchor (returns null → preset serves)', async () => {
    const offAnchor = mockClient(JSON.stringify({ option: 'completely unrelated wording here', whyDesc: 'nothing on the subject' }));
    expect(await generatePerUserRecord('ABSENCE_TEST_CREATION', 1, 'x', offAnchor)).toBeNull();
  });

  it('persists the generated record under source=autogen', async () => {
    const store = await openStore(':memory:');
    const stored = await generateAndStoreAutogenRecord(store, '/p', 'ABSENCE_TEST_CREATION', 2, 'x', okClient);
    expect(stored).toBe(true);
    expect(getContentTemplate(store.db, '/p', 'ABSENCE_TEST_CREATION', 'autogen')).not.toBeNull();
    store.db.close();
  });
});

describe('auto-template-generator — pattern summary + selection persistence', () => {
  it('summarizes the strong practices + maturity, never raw prompt text', () => {
    const profile: RightGoodProfile = { test_creation: rg('right_good'), documentation: rg('mistake') };
    const s = buildPatternSummary(profile, 3);
    expect(s).toContain('Maturity level: 3');
    expect(s).toContain('test_creation');
    expect(s).not.toContain('documentation'); // only reliably-good practices are summarized
  });

  it('includes work-style traits and dev-environment facts when provided', () => {
    const ws = {
      decisionRhythm:   { value: 'deliberative', stable: true, observations: 5, sessions: 2, dormant: false },
      explanationDepth: { value: null, stable: false, observations: 0, sessions: 0, dormant: true },
      abstractionLevel: { value: 'architecture_first', stable: true, observations: 5, sessions: 2, dormant: false },
    } as unknown as import('../classifier/work-style-traits.js').WorkStyleProfile;
    const env = {
      framework: { value: 'react' }, has_git: { value: true }, has_ci: { value: false }, unknown: { value: null },
    } as unknown as import('../env/types.js').FactMap;
    const s = buildPatternSummary({}, 3, ws, env);
    expect(s).toContain('deliberative');          // work-style trait
    expect(s).toContain('architecture_first');
    expect(s).toContain('react');                 // env fact (string value)
    expect(s).toContain('has_git');               // boolean true → key listed
    expect(s).not.toContain('has_ci');            // boolean false → omitted
    expect(s).not.toContain('unknown');           // null value → omitted
  });

  it('reports no distinctive practices for an empty profile', () => {
    expect(buildPatternSummary({}, 2)).toContain('No consistently distinctive');
  });

  it('persists + reads the ranked selection round-trip', async () => {
    const store = await openStore(':memory:');
    expect(selectionComputed(store, '/p')).toBe(false);
    expect(readSelection(store, '/p')).toBeNull();
    persistSelection(store, '/p', [{ signalType: 'ABSENCE_TEST_CREATION', confidence: 0.9 }]);
    expect(selectionComputed(store, '/p')).toBe(true);
    expect(readSelection(store, '/p')).toEqual([{ signalType: 'ABSENCE_TEST_CREATION', confidence: 0.9 }]);
    expect(isTopicSelected(store, '/p', 'ABSENCE_TEST_CREATION')).toBe(true);
    expect(isTopicSelected(store, '/p', 'ABSENCE_DOCUMENTATION')).toBe(false);
    store.db.close();
  });

  it('records an empty selection as computed (never re-ranks)', async () => {
    const store = await openStore(':memory:');
    persistSelection(store, '/p', []);
    expect(selectionComputed(store, '/p')).toBe(true);
    expect(readSelection(store, '/p')).toEqual([]);
    expect(isTopicSelected(store, '/p', 'ANYTHING')).toBe(false);
    store.db.close();
  });
});

describe('auto-template-generator — live orchestration (runAutogenForFire)', () => {
  const profile: RightGoodProfile = { test_creation: rg('right_good') }; // has history (occurrences > 0)

  // One mock that answers BOTH LLM calls: the ranking prompt → {topics}, the generation prompt → {option, whyDesc}.
  function autogenMockClient(): OpenAI {
    return { chat: { completions: { create: async (req: { messages: { content: string }[] }) => {
      const prompt = req.messages[0].content;
      const content = prompt.includes('rank which')
        ? JSON.stringify({ topics: [{ signalType: 'ABSENCE_TEST_CREATION', confidence: 0.9 }] })
        : JSON.stringify({ option: 'personalized test option', whyDesc: 'personalized test explanation' });
      return { choices: [{ message: { content } }] };
    } } } } as unknown as OpenAI;
  }

  it('first fire runs the ranking + generates the selected topic; a second fire is a no-op', async () => {
    const store = await openStore(':memory:');
    expect(selectionComputed(store, '/p')).toBe(false);
    await runAutogenForFire({ store, projectRoot: '/p', signalType: 'ABSENCE_TEST_CREATION', currentLevel: 3, rightGood: profile, client: autogenMockClient() });
    expect(selectionComputed(store, '/p')).toBe(true);
    expect(isTopicSelected(store, '/p', 'ABSENCE_TEST_CREATION')).toBe(true);
    expect(getContentTemplate(store.db, '/p', 'ABSENCE_TEST_CREATION', 'autogen')).not.toBeNull();
    await runAutogenForFire({ store, projectRoot: '/p', signalType: 'ABSENCE_TEST_CREATION', currentLevel: 3, rightGood: profile, client: autogenMockClient() });
    expect(getContentTemplate(store.db, '/p', 'ABSENCE_TEST_CREATION', 'autogen')).not.toBeNull();
    store.db.close();
  });

  it('no history: persists an empty selection, generates nothing, makes NO LLM call', async () => {
    const store = await openStore(':memory:');
    let calls = 0;
    const client = { chat: { completions: { create: async () => { calls++; return { choices: [{ message: { content: '{}' } }] }; } } } } as unknown as OpenAI;
    await runAutogenForFire({ store, projectRoot: '/p', signalType: 'ABSENCE_TEST_CREATION', currentLevel: 2, rightGood: {}, client });
    expect(selectionComputed(store, '/p')).toBe(true);
    expect(readSelection(store, '/p')).toEqual([]);
    expect(getContentTemplate(store.db, '/p', 'ABSENCE_TEST_CREATION', 'autogen')).toBeNull();
    expect(calls).toBe(0);
    store.db.close();
  });

  it('spends nothing when the budget is exhausted — selection stays uncomputed to retry later', async () => {
    const store = await openStore(':memory:');
    setConfig(store, 'autogen_call_budget', '0'); // no calls allowed this month
    await runAutogenForFire({ store, projectRoot: '/p', signalType: 'ABSENCE_TEST_CREATION', currentLevel: 3, rightGood: profile, client: autogenMockClient() });
    expect(selectionComputed(store, '/p')).toBe(false); // budget-blocked → not computed → retries
    expect(getContentTemplate(store.db, '/p', 'ABSENCE_TEST_CREATION', 'autogen')).toBeNull();
    store.db.close();
  });
});

describe('auto-template-generator — budget accounting on a failed generation', () => {
  const profile: RightGoodProfile = { test_creation: rg('right_good') };

  it('counts the LLM call even when the generation fails the gate, and does not retry unboundedly', async () => {
    const store = await openStore(':memory:');
    persistSelection(store, '/p', [{ signalType: 'ABSENCE_TEST_CREATION', confidence: 0.9 }]);
    persistPolaritySnapshot(store, '/p', [{ signalType: 'ABSENCE_TEST_CREATION', confidence: 0.9 }], profile);
    setConfig(store, 'autogen_call_budget', '1'); // exactly one call allowed this month
    // A reply that fails the topic-anchor gate → generateAndStore returns false, but a call WAS made.
    const offAnchor = mockClient(JSON.stringify({ option: 'completely unrelated wording', whyDesc: 'nothing relevant' }));
    await runAutogenForFire({ store, projectRoot: '/p', signalType: 'ABSENCE_TEST_CREATION', currentLevel: 3, rightGood: profile, client: offAnchor });
    expect(autogenCallsThisMonth(store, '/p')).toBe(1);                                       // spend counted despite the failure
    expect(getContentTemplate(store.db, '/p', 'ABSENCE_TEST_CREATION', 'autogen')).toBeNull();
    // Second fire: the budget is now exhausted → no further call (no infinite uncounted retry).
    await runAutogenForFire({ store, projectRoot: '/p', signalType: 'ABSENCE_TEST_CREATION', currentLevel: 3, rightGood: profile, client: offAnchor });
    expect(autogenCallsThisMonth(store, '/p')).toBe(1);
    store.db.close();
  });
});

describe('auto-template-generator — refresh on drift + maturity change (affected topics only)', () => {
  it('material drift: drops a selected topic that becomes a mistake and evicts its record', async () => {
    const store = await openStore(':memory:');
    persistSelection(store, '/p', [{ signalType: 'ABSENCE_TEST_CREATION', confidence: 0.9 }]);
    persistPolaritySnapshot(store, '/p', [{ signalType: 'ABSENCE_TEST_CREATION', confidence: 0.9 }], { test_creation: rg('right_good') });
    upsertContentTemplate(store, { projectRoot: '/p', signalType: 'ABSENCE_TEST_CREATION', source: 'autogen', record: { any: 'thing' } });
    setConfig(store, 'autogen_call_budget', '0'); // isolate drift from any generation attempt
    // The topic now maps to a mistake → must be dropped (never personalize a bad habit).
    await runAutogenForFire({ store, projectRoot: '/p', signalType: 'ABSENCE_TEST_CREATION', currentLevel: 3, rightGood: { test_creation: rg('mistake') }, client: mockClient('{}') });
    expect(isTopicSelected(store, '/p', 'ABSENCE_TEST_CREATION')).toBe(false);
    expect(getContentTemplate(store.db, '/p', 'ABSENCE_TEST_CREATION', 'autogen')).toBeNull();
    store.db.close();
  });

  it('material drift: evicts a still-eligible topic\'s record when its polarity drifted (regenerate)', async () => {
    const store = await openStore(':memory:');
    persistSelection(store, '/p', [{ signalType: 'IDEA_TO_PRD', confidence: 0.9 }]);
    setConfig(store, 'autogen_polarity:/p', JSON.stringify({ IDEA_TO_PRD: 'good' })); // snapshot ≠ live in_between
    upsertContentTemplate(store, { projectRoot: '/p', signalType: 'IDEA_TO_PRD', source: 'autogen', record: { any: 'thing' } });
    setConfig(store, 'autogen_call_budget', '0'); // isolate drift from regeneration
    await runAutogenForFire({ store, projectRoot: '/p', signalType: 'IDEA_TO_PRD', currentLevel: 3, rightGood: {}, client: mockClient('{}') });
    expect(isTopicSelected(store, '/p', 'IDEA_TO_PRD')).toBe(true);                         // still eligible → kept
    expect(getContentTemplate(store.db, '/p', 'IDEA_TO_PRD', 'autogen')).toBeNull();        // stale record evicted for regen
    store.db.close();
  });

  it('graduation refresh: re-ranks over the current selection only, dropping below-bar topics + records', async () => {
    const store = await openStore(':memory:');
    const rgProfile: RightGoodProfile = { test_creation: rg('right_good'), documentation: rg('right_good') };
    const selected = [
      { signalType: 'ABSENCE_TEST_CREATION', confidence: 0.9 },
      { signalType: 'ABSENCE_DOCUMENTATION', confidence: 0.9 },
    ];
    persistSelection(store, '/p', selected);
    persistPolaritySnapshot(store, '/p', selected, rgProfile);
    upsertContentTemplate(store, { projectRoot: '/p', signalType: 'ABSENCE_DOCUMENTATION', source: 'autogen', record: { any: 'x' } });
    markAutogenRefresh(store, '/p'); // graduation flagged the refresh
    // Re-rank keeps TEST_CREATION (0.9) and drops DOCUMENTATION (0.3, below the bar).
    const client = mockClient(JSON.stringify({ topics: [
      { signalType: 'ABSENCE_TEST_CREATION', confidence: 0.9 },
      { signalType: 'ABSENCE_DOCUMENTATION', confidence: 0.3 },
    ] }));
    await runAutogenForFire({ store, projectRoot: '/p', signalType: 'ABSENCE_TEST_CREATION', currentLevel: 4, rightGood: rgProfile, client });
    expect(autogenRefreshPending(store, '/p')).toBe(false);
    expect(isTopicSelected(store, '/p', 'ABSENCE_TEST_CREATION')).toBe(true);
    expect(isTopicSelected(store, '/p', 'ABSENCE_DOCUMENTATION')).toBe(false);
    expect(getContentTemplate(store.db, '/p', 'ABSENCE_DOCUMENTATION', 'autogen')).toBeNull(); // dropped → record evicted
    store.db.close();
  });

  it('graduation refresh: keeps the flag when the budget blocks the re-rank (retries later)', async () => {
    const store = await openStore(':memory:');
    const rgProfile: RightGoodProfile = { test_creation: rg('right_good') };
    persistSelection(store, '/p', [{ signalType: 'ABSENCE_TEST_CREATION', confidence: 0.9 }]);
    persistPolaritySnapshot(store, '/p', [{ signalType: 'ABSENCE_TEST_CREATION', confidence: 0.9 }], rgProfile);
    markAutogenRefresh(store, '/p');
    setConfig(store, 'autogen_call_budget', '0'); // no budget → re-rank cannot run
    await runAutogenForFire({ store, projectRoot: '/p', signalType: 'ABSENCE_TEST_CREATION', currentLevel: 4, rightGood: rgProfile, client: mockClient('{}') });
    expect(autogenRefreshPending(store, '/p')).toBe(true); // flag preserved → retries when budget resets
    store.db.close();
  });
});

describe('auto-template-generator — generation prompt agent voice (Phase 16.3)', () => {
  it('directs the why-desc to stay agent-voice while the option is the developer→agent message', () => {
    const prompt = buildGenerationPrompt(
      { option: 'Write one test for the main behaviour.', whyDesc: 'Just one test — the single most important behaviour.' },
      'uses Vitest, small team',
    );
    // The generated why-desc must stay agent-voice — a direct instruction the coding agent reads.
    expect(prompt).toMatch(/agent voice/i);
    expect(prompt).toMatch(/direct instruction the coding agent reads/i);
    // The option channel stays the message the developer sends to the agent.
    expect(prompt).toMatch(/message the developer sends to the agent/i);
    // Safety rules preserved (defence-in-depth behind the sanitize gate).
    expect(prompt).toMatch(/never copy raw prompt text/i);
  });
});
