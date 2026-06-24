import { describe, it, expect } from 'vitest';
import { cursorV2025Q1 } from './cursor-v2025-q1.js';
import type { ItemTableRow } from '../chat-history-types.js';

const SRC = '/fake/state.vscdb';
const KEY = 'composer.composerData';

const wrap = (composerData: unknown): ItemTableRow => ({
  key: KEY,
  value: JSON.stringify(composerData),
});

describe('cursorV2025Q1 extractor', () => {
  describe('static fields', () => {
    it('has the expected id, label, and fingerprint keys', () => {
      expect(cursorV2025Q1.id).toBe('cursor-v2025-q1');
      expect(cursorV2025Q1.label).toContain('Composer');
      expect(cursorV2025Q1.fingerprintKeys).toEqual([KEY]);
    });
  });

  describe('ownsKey', () => {
    it('matches exactly composer.composerData', () => {
      expect(cursorV2025Q1.ownsKey(KEY)).toBe(true);
    });
    it('does not match other keys', () => {
      expect(cursorV2025Q1.ownsKey('aiService.prompts')).toBe(false);
      expect(cursorV2025Q1.ownsKey('composer.other')).toBe(false);
      expect(cursorV2025Q1.ownsKey('composerData.composerData')).toBe(false);
    });
  });

  describe('decodeRow', () => {
    it('extracts user messages with role=user, ignoring assistant messages', () => {
      const events = cursorV2025Q1.decodeRow(
        wrap({
          allComposers: {
            c1: {
              composerId: 'c1',
              conversation: [
                { role: 'user', text: 'hello' },
                { role: 'assistant', text: 'hi' },
                { role: 'user', text: 'follow-up' },
              ],
            },
          },
        }),
        SRC,
      );
      expect(events.map((e) => e.prompt)).toEqual(['hello', 'follow-up']);
      expect(events.every((e) => e.rawSessionId === 'composer:c1')).toBe(true);
      expect(events.every((e) => e.extractorId === 'cursor-v2025-q1')).toBe(true);
    });

    it('supports legacy numeric type=1 for user messages', () => {
      const events = cursorV2025Q1.decodeRow(
        wrap({
          allComposers: {
            c2: {
              composerId: 'c2',
              conversation: [
                { type: 1, text: 'legacy-user' },
                { type: 2, text: 'legacy-assistant' },
              ],
            },
          },
        }),
        SRC,
      );
      expect(events).toHaveLength(1);
      expect(events[0]!.prompt).toBe('legacy-user');
    });

    it('supports the `content` field as fallback when `text` is missing', () => {
      const events = cursorV2025Q1.decodeRow(
        wrap({
          allComposers: {
            c3: {
              composerId: 'c3',
              conversation: [{ role: 'user', content: 'from-content' }],
            },
          },
        }),
        SRC,
      );
      expect(events[0]!.prompt).toBe('from-content');
    });

    it('emits events per composer when multiple conversations exist', () => {
      const events = cursorV2025Q1.decodeRow(
        wrap({
          allComposers: {
            a: { composerId: 'a', conversation: [{ role: 'user', text: 'from-a' }] },
            b: { composerId: 'b', conversation: [{ role: 'user', text: 'from-b' }] },
          },
        }),
        SRC,
      );
      const sessions = events.map((e) => e.rawSessionId).sort();
      expect(sessions).toEqual(['composer:a', 'composer:b']);
    });

    it('returns [] for malformed JSON', () => {
      expect(
        cursorV2025Q1.decodeRow({ key: KEY, value: 'not-json' }, SRC),
      ).toEqual([]);
    });

    it('returns [] when allComposers is missing or empty', () => {
      expect(cursorV2025Q1.decodeRow(wrap({}), SRC)).toEqual([]);
      expect(cursorV2025Q1.decodeRow(wrap({ allComposers: {} }), SRC)).toEqual([]);
    });

    it('returns [] for foreign keys', () => {
      expect(
        cursorV2025Q1.decodeRow({ key: 'unrelated', value: '{}' }, SRC),
      ).toEqual([]);
    });
  });
});
