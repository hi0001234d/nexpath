import { describe, it, expect } from 'vitest';
import {
  ALL_EXTRACTORS,
  getExtractorById,
  pickExtractor,
} from './index.js';

describe('extractor registry', () => {
  it('lists all four extractors in newest-first order', () => {
    expect(ALL_EXTRACTORS.map((e) => e.id)).toEqual([
      'cursor-v2025-q2',
      'cursor-v2025-q1',
      'cursor-v2024-q4',
      'windsurf',
    ]);
  });

  it('getExtractorById returns the matching extractor', () => {
    expect(getExtractorById('cursor-v2025-q2')?.id).toBe('cursor-v2025-q2');
    expect(getExtractorById('windsurf')?.id).toBe('windsurf');
  });

  it('getExtractorById returns undefined for unknown ids', () => {
    expect(getExtractorById('nonexistent')).toBeUndefined();
  });
});

describe('pickExtractor (M4 fingerprint)', () => {
  it('returns "unknown" for an empty key list', () => {
    const result = pickExtractor([]);
    expect(result.kind).toBe('unknown');
    if (result.kind === 'unknown') {
      expect(result.observedKeyCount).toBe(0);
      expect(result.observedSampleKeys).toEqual([]);
    }
  });

  it('returns "unknown" when no keys match any extractor', () => {
    const result = pickExtractor(['unrelated.key.1', 'another.thing', 'foo.bar']);
    expect(result.kind).toBe('unknown');
    if (result.kind === 'unknown') {
      expect(result.observedKeyCount).toBe(3);
      expect(result.observedSampleKeys).toEqual([
        'unrelated.key.1',
        'another.thing',
        'foo.bar',
      ]);
    }
  });

  it('caps observedSampleKeys to 5 entries', () => {
    const result = pickExtractor(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    if (result.kind === 'unknown') {
      expect(result.observedSampleKeys).toHaveLength(5);
    }
  });

  it('picks cursor-v2024-q4 when aiService.prompts is the matching key', () => {
    const result = pickExtractor([
      'aiService.prompts',
      'workbench.editor.recent',
      'foo.bar',
    ]);
    expect(result.kind).toBe('known');
    if (result.kind === 'known') {
      expect(result.extractor.id).toBe('cursor-v2024-q4');
      expect(result.matchedKeys).toEqual(['aiService.prompts']);
    }
  });

  it('picks cursor-v2025-q1 when composer.composerData is present', () => {
    const result = pickExtractor(['composer.composerData', 'other.key']);
    expect(result.kind).toBe('known');
    if (result.kind === 'known') {
      expect(result.extractor.id).toBe('cursor-v2025-q1');
    }
  });

  it('picks cursor-v2025-q2 when chatHistory keys are present (prefix match)', () => {
    const result = pickExtractor([
      'cursorAIChatService.chatHistory.tab-1',
      'cursorAIChatService.chatHistory.tab-2',
      'workbench.recent.files',
    ]);
    expect(result.kind).toBe('known');
    if (result.kind === 'known') {
      expect(result.extractor.id).toBe('cursor-v2025-q2');
      expect(result.matchedKeys).toEqual([
        'cursorAIChatService.chatHistory.tab-1',
        'cursorAIChatService.chatHistory.tab-2',
      ]);
    }
  });

  it('picks the extractor with the highest match count when multiple match', () => {
    // q2 has 3 chatHistory matches; q4 has 1 prompts match — q2 should win.
    const result = pickExtractor([
      'aiService.prompts',
      'cursorAIChatService.chatHistory.t1',
      'cursorAIChatService.chatHistory.t2',
      'cursorAIChatService.chatHistory.t3',
    ]);
    expect(result.kind).toBe('known');
    if (result.kind === 'known') {
      expect(result.extractor.id).toBe('cursor-v2025-q2');
    }
  });

  it('picks the newer extractor on a tie (registry order)', () => {
    // q4 has 1 match (aiService.prompts); q1 has 1 match (composerData)
    // — q1 wins because it appears earlier in ALL_EXTRACTORS.
    const result = pickExtractor([
      'aiService.prompts',
      'composer.composerData',
    ]);
    expect(result.kind).toBe('known');
    if (result.kind === 'known') {
      expect(result.extractor.id).toBe('cursor-v2025-q1');
    }
  });

  it('picks windsurf when only cascade keys are present', () => {
    const result = pickExtractor(['cascade.history', 'cascade.settings']);
    expect(result.kind).toBe('known');
    if (result.kind === 'known') {
      expect(result.extractor.id).toBe('windsurf');
    }
  });
});
