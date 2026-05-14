import { describe, it, expect } from 'vitest';
import { windsurf } from './windsurf.js';

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
