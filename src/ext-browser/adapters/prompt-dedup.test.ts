import { describe, it, expect } from 'vitest';
import { normalizePromptForDedup } from './prompt-dedup.js';

describe('normalizePromptForDedup — the F1 whitespace-drift collapser', () => {
  it('folds every whitespace run to one space and trims the ends', () => {
    expect(normalizePromptForDedup('  My original request:\n\nPlan a page.\t\tKeep it minimal. \n'))
      .toBe('My original request: Plan a page. Keep it minimal.');
  });

  it('maps the composer-innerText and fetch-body serializations of one prompt to the same identity', () => {
    // The live F1 shape: same words, different line-break/spacing serialization.
    const composerRead = 'My original request (verbatim):\nPlan a tiny page.\n\nScope Non Goals:\n- Cover scope.';
    const fetchBody = 'My original request (verbatim):\n\nPlan a tiny page.\nScope Non Goals:\n\n- Cover scope.\n';
    expect(normalizePromptForDedup(composerRead)).toBe(normalizePromptForDedup(fetchBody));
  });

  it('keeps genuinely different prompts different — only whitespace is folded', () => {
    expect(normalizePromptForDedup('Plan a tiny page'))
      .not.toBe(normalizePromptForDedup('Plan a tiny page!'));
    expect(normalizePromptForDedup('add a hero section'))
      .not.toBe(normalizePromptForDedup('add a hero sections'));
  });

  it('whitespace-only input normalizes to the empty string (treated as no prompt)', () => {
    expect(normalizePromptForDedup(' \n\t ')).toBe('');
  });
});
