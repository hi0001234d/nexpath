import { describe, expect, it, vi } from 'vitest';

vi.mock('../telemetry/index.js', () => ({
  writeTelemetry: vi.fn(),
  TELEMETRY_PATH: '/mock/telemetry.jsonl',
}));

import {
  CLIPBOARD_ONLY,
  OPTION_SEPARATOR,
  runDecisionSession,
  runLevel,
} from './DecisionSession.js';
import type { DecisionSessionInput, SelectFn } from './DecisionSession.js';
import { resolveDecisionContent, SHOW_SIMPLER } from './options.js';
import { openStore } from '../store/db.js';
import { getSkippedSessions } from '../store/skipped-sessions.js';

function makeInput(overrides: Partial<DecisionSessionInput> = {}): DecisionSessionInput {
  return {
    stage:                'implementation',
    flagType:             'stage_transition',
    pinchLabel:           'Hold up.',
    sessionId:            'session-phase1',
    projectRoot:          '/test/phase1',
    promptCount:          20,
    decisionSessionCount: 5,
    ...overrides,
  };
}

function mockSelect(value: string): SelectFn {
  return vi.fn().mockResolvedValue(value);
}

function expectNoRuntimePlaceholders(text: string) {
  expect(text).not.toMatch(/\{R4_[A-Z0-9_]+\}/);
  expect(text).not.toMatch(/\{R5_INJECT:[^}]*\}/);
}

describe('decision-session flow E2E (Phase 1)', () => {
  it('returns the second Level 1 content option when the user selects it', async () => {
    const content = resolveDecisionContent('implementation', 'stage_transition');
    const secondOption = content.L1[1]!.option;

    const result = await runDecisionSession(makeInput(), undefined, mockSelect(secondOption));

    expect(result).toEqual({ outcome: 'selected', selectedPrompt: secondOption });
  });

  it('returns the second Level 2 content option after the user steps down once', async () => {
    const content = resolveDecisionContent('implementation', 'stage_transition');
    const secondLevel2Option = content.L2[1]!.option;
    const selectFn = vi.fn()
      .mockResolvedValueOnce(SHOW_SIMPLER)
      .mockResolvedValueOnce(secondLevel2Option);

    const result = await runDecisionSession(makeInput(), undefined, selectFn as SelectFn);

    expect(selectFn).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ outcome: 'selected', selectedPrompt: secondLevel2Option });
  });

  it('clipboard-only at Level 1 returns clipboard_only and does not create a skipped row', async () => {
    const store = await openStore(':memory:');
    try {
      const input = makeInput({ projectRoot: '/proj/clipboard-l1' });
      const result = await runDecisionSession(input, store, mockSelect(CLIPBOARD_ONLY));

      expect(result).toEqual({ outcome: 'clipboard_only' });
      expect(getSkippedSessions(store, '/proj/clipboard-l1')).toHaveLength(0);
    } finally {
      store.db.close();
    }
  });

  it('clipboard-only still returns clipboard_only after the user steps down to Level 2', async () => {
    const store = await openStore(':memory:');
    try {
      const input = makeInput({ projectRoot: '/proj/clipboard-l2' });
      const selectFn = vi.fn()
        .mockResolvedValueOnce(SHOW_SIMPLER)
        .mockResolvedValueOnce(CLIPBOARD_ONLY);

      const result = await runDecisionSession(input, store, selectFn as SelectFn);

      expect(selectFn).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ outcome: 'clipboard_only' });
      expect(getSkippedSessions(store, '/proj/clipboard-l2')).toHaveLength(0);
    } finally {
      store.db.close();
    }
  });

  it('selected prompts remain placeholder-free across Levels 1, 2, and 3', async () => {
    const content = resolveDecisionContent('implementation', 'stage_transition');
    const flows: Array<{ name: string; selectFn: SelectFn; expected: string }> = [
      {
        name: 'level-1',
        selectFn: mockSelect(content.L1[0]!.option),
        expected: content.L1[0]!.option,
      },
      {
        name: 'level-2',
        selectFn: vi.fn()
          .mockResolvedValueOnce(SHOW_SIMPLER)
          .mockResolvedValueOnce(content.L2[0]!.option) as unknown as SelectFn,
        expected: content.L2[0]!.option,
      },
      {
        name: 'level-3',
        selectFn: vi.fn()
          .mockResolvedValueOnce(SHOW_SIMPLER)
          .mockResolvedValueOnce(SHOW_SIMPLER)
          .mockResolvedValueOnce(content.L3[0]!.option) as unknown as SelectFn,
        expected: content.L3[0]!.option,
      },
    ];

    for (const flow of flows) {
      const result = await runDecisionSession(makeInput({ sessionId: `session-${flow.name}` }), undefined, flow.selectFn);
      expect(result).toEqual({ outcome: 'selected', selectedPrompt: flow.expected });
      if (result.outcome === 'selected') expectNoRuntimePlaceholders(result.selectedPrompt);
    }
  });

  it('selected flow returns only option text and never appends desc-base body text', async () => {
    const content = resolveDecisionContent('implementation', 'stage_transition');
    const l1 = content.L1[0]!;
    const l2 = content.L2[0]!;
    const l3 = content.L3[0]!;

    const level1 = await runDecisionSession(makeInput({ sessionId: 'desc-l1' }), undefined, mockSelect(l1.option));
    const level2 = await runDecisionSession(
      makeInput({ sessionId: 'desc-l2' }),
      undefined,
      vi.fn().mockResolvedValueOnce(SHOW_SIMPLER).mockResolvedValueOnce(l2.option) as unknown as SelectFn,
    );
    const level3 = await runDecisionSession(
      makeInput({ sessionId: 'desc-l3' }),
      undefined,
      vi.fn().mockResolvedValueOnce(SHOW_SIMPLER).mockResolvedValueOnce(SHOW_SIMPLER).mockResolvedValueOnce(l3.option) as unknown as SelectFn,
    );

    expect(level1).toEqual({ outcome: 'selected', selectedPrompt: l1.option });
    expect(level2).toEqual({ outcome: 'selected', selectedPrompt: l2.option });
    expect(level3).toEqual({ outcome: 'selected', selectedPrompt: l3.option });

    if (level1.outcome === 'selected') expect(level1.selectedPrompt).not.toContain(l1.descBase);
    if (level2.outcome === 'selected') expect(level2.selectedPrompt).not.toContain(l2.descBase);
    if (level3.outcome === 'selected') expect(level3.selectedPrompt).not.toContain(l3.descBase);
  });

  it('meta rows carry no desc-base payload while content rows still do', async () => {
    const selectFn = vi.fn().mockResolvedValueOnce(`${OPTION_SEPARATOR}help`);

    await runLevel(makeInput(), 1, selectFn as SelectFn);

    const call = selectFn.mock.calls[0]![0];
    const contentRows = call.options.filter((option: { value: string; isMeta?: boolean; isSeparator?: boolean }) =>
      !option.value.startsWith(OPTION_SEPARATOR) && !option.isMeta && !option.isSeparator,
    );
    const metaRows = call.options.filter((option: { isMeta?: boolean }) => option.isMeta);

    expect(contentRows.length).toBeGreaterThan(0);
    expect(metaRows.length).toBeGreaterThan(0);
    expect(contentRows.every((option: { descBase?: string }) => typeof option.descBase === 'string' && option.descBase.length > 0)).toBe(true);
    expect(metaRows.every((option: { descBase?: string }) => option.descBase === undefined)).toBe(true);
  });
});
