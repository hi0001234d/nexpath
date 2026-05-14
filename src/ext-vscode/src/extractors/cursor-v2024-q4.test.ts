import { describe, it, expect } from 'vitest';
import { cursorV2024Q4 } from './cursor-v2024-q4.js';
import type { ItemTableRow } from '../chat-history-types.js';

const SRC = '/fake/state.vscdb';

describe('cursorV2024Q4 extractor', () => {
  describe('static fields', () => {
    it('has the expected id, label, and fingerprint keys', () => {
      expect(cursorV2024Q4.id).toBe('cursor-v2024-q4');
      expect(cursorV2024Q4.label).toContain('v2024-Q4');
      expect(cursorV2024Q4.fingerprintKeys).toEqual(['aiService.prompts']);
    });
  });

  describe('ownsKey', () => {
    it('matches exactly aiService.prompts', () => {
      expect(cursorV2024Q4.ownsKey('aiService.prompts')).toBe(true);
    });
    it('does not match other keys', () => {
      expect(cursorV2024Q4.ownsKey('aiService.generations')).toBe(false);
      expect(cursorV2024Q4.ownsKey('aiService.prompts.extra')).toBe(false);
      expect(cursorV2024Q4.ownsKey('')).toBe(false);
    });
  });

  describe('decodeRow', () => {
    const row = (value: unknown): ItemTableRow => ({
      key: 'aiService.prompts',
      value: JSON.stringify(value),
    });

    it('returns one event per prompt entry with text', () => {
      const events = cursorV2024Q4.decodeRow(
        row([{ text: 'first' }, { text: 'second' }, { text: 'third' }]),
        SRC,
      );
      expect(events).toHaveLength(3);
      expect(events.map((e) => e.prompt)).toEqual(['first', 'second', 'third']);
      expect(events.every((e) => e.extractorId === 'cursor-v2024-q4')).toBe(true);
      expect(events.every((e) => e.sourcePath === SRC)).toBe(true);
    });

    it('uses prompts-index as rawSessionId', () => {
      const events = cursorV2024Q4.decodeRow(row([{ text: 'a' }, { text: 'b' }]), SRC);
      expect(events.map((e) => e.rawSessionId)).toEqual([
        'prompts-index:0',
        'prompts-index:1',
      ]);
    });

    it('skips entries with no text field', () => {
      const events = cursorV2024Q4.decodeRow(
        row([{ text: 'ok' }, { commandType: 1 }, { text: '' }, { text: 'still-ok' }]),
        SRC,
      );
      expect(events.map((e) => e.prompt)).toEqual(['ok', 'still-ok']);
    });

    it('returns [] for foreign keys', () => {
      const events = cursorV2024Q4.decodeRow(
        { key: 'someOtherKey', value: '[]' },
        SRC,
      );
      expect(events).toEqual([]);
    });

    it('returns [] for malformed JSON', () => {
      const events = cursorV2024Q4.decodeRow(
        { key: 'aiService.prompts', value: 'not-json{{{' },
        SRC,
      );
      expect(events).toEqual([]);
    });

    it('returns [] for non-array JSON', () => {
      expect(cursorV2024Q4.decodeRow(row({}), SRC)).toEqual([]);
      expect(cursorV2024Q4.decodeRow(row(null), SRC)).toEqual([]);
      expect(cursorV2024Q4.decodeRow(row('string'), SRC)).toEqual([]);
    });
  });
});
