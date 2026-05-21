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

    it("uses a stable 'ask-mode' rawSessionId for every prompt (NOT positional index)", () => {
      // Regression for the M2 R3 FIFO-shift bug (2026-05-20): the previous
      // positional `prompts-index:${i}` rawSessionId caused every Cursor
      // restart with a full FIFO to re-emit the entire backlog because
      // the dedup signature shifted when a new prompt pushed out the
      // oldest. Content-stable rawSessionId means the signature depends
      // only on (sourcePath, prompt text), which survives FIFO shifts.
      const events = cursorV2024Q4.decodeRow(row([{ text: 'a' }, { text: 'b' }]), SRC);
      expect(events.map((e) => e.rawSessionId)).toEqual(['ask-mode', 'ask-mode']);
    });

    it('FIFO-shift regression: same prompts in shifted positions produce the SAME (sourcePath,text)-stable signature', () => {
      // Simulates the live M2 R3 scenario: an Ask-mode FIFO of 10 prompts
      // shifts left by 1 (oldest dropped, new appended). The text-stable
      // rawSessionId means each individual prompt's downstream watcher
      // signature `${sourcePath}|${rawSessionId}|${prompt}` is unchanged
      // by the shift, so the watcher's seenSignatures dedup correctly
      // recognises them as already-seen.
      const before = cursorV2024Q4.decodeRow(
        row(Array.from({ length: 10 }, (_, i) => ({ text: `prompt-${i}` }))),
        SRC,
      );
      // FIFO shift: drop prompt-0, append prompt-10.
      const after = cursorV2024Q4.decodeRow(
        row([
          ...Array.from({ length: 9 }, (_, i) => ({ text: `prompt-${i + 1}` })),
          { text: 'prompt-10' },
        ]),
        SRC,
      );
      // Build the signature for each event the way chat-history-watcher does.
      const sigOf = (e: { sourcePath: string; rawSessionId: string; prompt: string }) =>
        `${e.sourcePath}|${e.rawSessionId}|${e.prompt}`;
      const beforeSigs = new Set(before.map(sigOf));
      const afterSigs = after.map(sigOf);
      // 9 of the 10 post-shift prompts must hit the dedup set; the new
      // tail (`prompt-10`) is the only one that's genuinely new.
      const newOnes = afterSigs.filter((s) => !beforeSigs.has(s));
      expect(newOnes).toHaveLength(1);
      expect(newOnes[0]).toContain('prompt-10');
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
