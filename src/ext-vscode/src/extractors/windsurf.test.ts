import { describe, it, expect } from 'vitest';
import { windsurf, decodeWindsurfJsonFile } from './windsurf.js';

describe('windsurf extractor (placeholder)', () => {
  it('has the expected id, label, and fingerprint', () => {
    expect(windsurf.id).toBe('windsurf');
    expect(windsurf.label).toContain('Cascade');
    expect(windsurf.fingerprintKeys).toEqual(['cascade.']);
  });

  it('matches cascade.* keys', () => {
    expect(windsurf.ownsKey('cascade.history')).toBe(true);
    expect(windsurf.ownsKey('cascade.something.else')).toBe(true);
  });

  it('does not match non-cascade keys', () => {
    expect(windsurf.ownsKey('aiService.prompts')).toBe(false);
    expect(windsurf.ownsKey('cursorAIChatService.chatHistory.tab-1')).toBe(false);
  });

  it('returns [] for any row (placeholder — real decoding lands in Branch 4)', () => {
    expect(windsurf.decodeRow({ key: 'cascade.history', value: '[]' }, '/p')).toEqual([]);
    expect(windsurf.decodeRow({ key: 'cascade.x', value: 'anything' }, '/p')).toEqual([]);
  });
});

describe('decodeWindsurfJsonFile (Drift A fix — JSON-file decoder contract)', () => {
  // The body is currently a no-op pending live-install schema identification
  // (see TODO in src/extractors/windsurf.ts). These tests lock the CONTRACT
  // — return type + signature — so when the engineer fills in the real
  // decoder, the watcher's expectations don't have to change. If/when the
  // decoder gains real behaviour, ADD new tests; don't remove these.

  it('returns [] for an empty object (current stub behaviour)', () => {
    expect(decodeWindsurfJsonFile({}, '/p/conv-1.json')).toEqual([]);
  });

  it('returns [] for null / undefined / non-object parsed values', () => {
    expect(decodeWindsurfJsonFile(null, '/p/f.json')).toEqual([]);
    expect(decodeWindsurfJsonFile(undefined, '/p/f.json')).toEqual([]);
    expect(decodeWindsurfJsonFile('a string', '/p/f.json')).toEqual([]);
    expect(decodeWindsurfJsonFile(42, '/p/f.json')).toEqual([]);
  });

  it('returns an array regardless of input shape (never throws on the stub path)', () => {
    expect(Array.isArray(decodeWindsurfJsonFile({ conversation: [] }, '/p'))).toBe(true);
    expect(
      Array.isArray(decodeWindsurfJsonFile({ messages: [{ role: 'user', content: 'hi' }] }, '/p')),
    ).toBe(true);
  });
});
