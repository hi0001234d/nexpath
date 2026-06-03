import { describe, it, expect } from 'vitest';
import type { PromptRecord } from '../classifier/types.js';
import type { Stage } from '../classifier/types.js';
import { recentPromptMetadata } from './recent-prompts.js';

function makePrompt(i: number, overrides: Partial<PromptRecord> = {}): PromptRecord {
  return {
    index:           i,
    text:            `prompt text #${i} — should NEVER appear in telemetry`,
    capturedAt:      1_700_000_000_000 + i * 1000,
    classifiedStage: 'implementation' as Stage,
    confidence:      0.85,
    ...overrides,
  };
}

describe('telemetry — recentPromptMetadata', () => {
  it('returns empty array when history is empty', () => {
    expect(recentPromptMetadata([])).toEqual([]);
  });

  it('returns all entries when history has fewer than 5', () => {
    const history = [1, 2, 3].map((i) => makePrompt(i));
    const result = recentPromptMetadata(history);
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.index)).toEqual([1, 2, 3]);
  });

  it('returns exactly the LAST 5 when history has more than 5', () => {
    const history = Array.from({ length: 12 }, (_, i) => makePrompt(i + 1));
    const result = recentPromptMetadata(history);
    expect(result).toHaveLength(5);
    expect(result.map((p) => p.index)).toEqual([8, 9, 10, 11, 12]);
  });

  it('preserves index, classifiedStage, confidence, capturedAt verbatim', () => {
    const history = [makePrompt(7, { confidence: 0.42, classifiedStage: 'planning' as Stage })];
    const result = recentPromptMetadata(history);
    expect(result[0]).toEqual({
      index:           7,
      classifiedStage: 'planning',
      confidence:      0.42,
      capturedAt:      1_700_000_007_000,
    });
  });

  it('NEVER includes the text field — PII safety guarantee', () => {
    const history = Array.from({ length: 5 }, (_, i) => makePrompt(i + 1));
    const result = recentPromptMetadata(history);
    for (const entry of result) {
      expect(entry).not.toHaveProperty('text');
    }
  });

  it('coerces undefined classifiedStage / confidence to null (defensive)', () => {
    // Build a record with the optional fields undefined — possible in some
    // edge cases (e.g. partial classifier failure). The contract is
    // "metadata is always shaped; missing fields become null on the wire".
    const partial = {
      index:      1,
      text:       'x',
      capturedAt: 1,
    } as unknown as PromptRecord;
    const result = recentPromptMetadata([partial]);
    expect(result[0].classifiedStage).toBeNull();
    expect(result[0].confidence).toBeNull();
  });

  it('does not mutate the input array', () => {
    const history = [1, 2, 3, 4, 5, 6, 7].map((i) => makePrompt(i));
    const before = history.length;
    recentPromptMetadata(history);
    expect(history.length).toBe(before);
  });
});
