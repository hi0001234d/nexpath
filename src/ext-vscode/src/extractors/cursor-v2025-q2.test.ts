import { describe, it, expect } from 'vitest';
import { cursorV2025Q2 } from './cursor-v2025-q2.js';
import type { ItemTableRow } from '../chat-history-types.js';

const SRC = '/fake/state.vscdb';
const KEY_PREFIX = 'cursorAIChatService.chatHistory.';

const wrap = (tabId: string, messages: unknown): ItemTableRow => ({
  key: `${KEY_PREFIX}${tabId}`,
  value: JSON.stringify(messages),
});

describe('cursorV2025Q2 extractor', () => {
  describe('static fields', () => {
    it('has the expected id, label, and prefix fingerprint', () => {
      expect(cursorV2025Q2.id).toBe('cursor-v2025-q2');
      expect(cursorV2025Q2.label).toContain('v2025-Q2');
      expect(cursorV2025Q2.fingerprintKeys).toEqual([KEY_PREFIX]);
    });
  });

  describe('ownsKey', () => {
    it('matches keys with the chatHistory prefix', () => {
      expect(cursorV2025Q2.ownsKey(`${KEY_PREFIX}abc`)).toBe(true);
      expect(cursorV2025Q2.ownsKey(`${KEY_PREFIX}tab-xyz-123`)).toBe(true);
    });
    it('does not match other keys', () => {
      expect(cursorV2025Q2.ownsKey('cursorAIChatService.other')).toBe(false);
      expect(cursorV2025Q2.ownsKey('aiService.prompts')).toBe(false);
    });
  });

  describe('decodeRow', () => {
    it('extracts role=user messages and tags rawSessionId with the tab id', () => {
      const events = cursorV2025Q2.decodeRow(
        wrap('tab-1', [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'reply' },
          { role: 'user', content: 'second' },
        ]),
        SRC,
      );
      expect(events.map((e) => e.prompt)).toEqual(['first', 'second']);
      expect(events.every((e) => e.rawSessionId === 'tab:tab-1')).toBe(true);
      expect(events.every((e) => e.extractorId === 'cursor-v2025-q2')).toBe(true);
    });

    it('uses `text` as fallback when `content` is missing', () => {
      const events = cursorV2025Q2.decodeRow(
        wrap('tab-2', [{ role: 'user', text: 'from-text' }]),
        SRC,
      );
      expect(events[0]!.prompt).toBe('from-text');
    });

    it('treats type="user" as a user message', () => {
      const events = cursorV2025Q2.decodeRow(
        wrap('tab-3', [
          { type: 'user', content: 'typed-user' },
          { type: 'assistant', content: 'typed-asst' },
        ]),
        SRC,
      );
      expect(events.map((e) => e.prompt)).toEqual(['typed-user']);
    });

    it('treats legacy numeric type=1 as a user message', () => {
      const events = cursorV2025Q2.decodeRow(
        wrap('tab-4', [
          { type: 1, content: 'legacy-user' },
          { type: 2, content: 'legacy-asst' },
        ]),
        SRC,
      );
      expect(events.map((e) => e.prompt)).toEqual(['legacy-user']);
    });

    it('returns [] for foreign keys', () => {
      const events = cursorV2025Q2.decodeRow(
        { key: 'some.other.key', value: '[]' },
        SRC,
      );
      expect(events).toEqual([]);
    });

    it('returns [] for malformed JSON', () => {
      expect(
        cursorV2025Q2.decodeRow(
          { key: `${KEY_PREFIX}tab-x`, value: 'not-json {{' },
          SRC,
        ),
      ).toEqual([]);
    });

    it('returns [] for non-array JSON', () => {
      expect(cursorV2025Q2.decodeRow(wrap('tab-z', {}), SRC)).toEqual([]);
      expect(cursorV2025Q2.decodeRow(wrap('tab-z', null), SRC)).toEqual([]);
    });

    it('skips messages without extractable text', () => {
      const events = cursorV2025Q2.decodeRow(
        wrap('tab-5', [
          { role: 'user', content: '' },
          { role: 'user' },
          { role: 'user', content: 'kept' },
        ]),
        SRC,
      );
      expect(events.map((e) => e.prompt)).toEqual(['kept']);
    });
  });
});
