import { describe, expect, it } from 'vitest';
import type { PromptRecord } from '../classifier/types.js';
import {
  hasR5Injection,
  substituteR5Placeholder,
  injectR5,
  strategyDFallback,
  extractVocab,
  isDroppedByVoiceRuleFilter,
  applyVoiceRuleFilter,
  type R5Register,
} from './r5-injection.js';

function makePrompt(text: string, index = 0): PromptRecord {
  return {
    index,
    text,
    capturedAt:      Date.now(),
    classifiedStage: 'implementation',
    confidence:      0.8,
  };
}

const SAMPLE_DESC_BASE_WITH_PLACEHOLDER = [
  '{R4_OPEN}',
  '{R5_INJECT: ~1-2 lines — "example user-grounded reason"}',
  'Gap-framing sentence.',
  'Direction-body sentence.',
  '{R4_CLOSE}',
].join('\n');

const SAMPLE_DESC_BASE_NO_PLACEHOLDER = [
  '{R4_OPEN}',
  'Gap-framing sentence.',
  'Direction-body sentence.',
  '{R4_CLOSE}',
].join('\n');

describe('r5-injection — hasR5Injection()', () => {
  it('returns true for a desc-base containing {R5_INJECT: ...}', () => {
    expect(hasR5Injection(SAMPLE_DESC_BASE_WITH_PLACEHOLDER)).toBe(true);
  });

  it('returns false for a desc-base without the placeholder', () => {
    expect(hasR5Injection(SAMPLE_DESC_BASE_NO_PLACEHOLDER)).toBe(false);
  });

  it('returns false for an empty input', () => {
    expect(hasR5Injection('')).toBe(false);
  });

  it('does not stateful-cache across consecutive calls (regex /g hazard)', () => {
    // Reset hazard: a stateful /g regex would return alternating results.
    expect(hasR5Injection(SAMPLE_DESC_BASE_WITH_PLACEHOLDER)).toBe(true);
    expect(hasR5Injection(SAMPLE_DESC_BASE_WITH_PLACEHOLDER)).toBe(true);
    expect(hasR5Injection(SAMPLE_DESC_BASE_WITH_PLACEHOLDER)).toBe(true);
  });
});

describe('r5-injection — substituteR5Placeholder()', () => {
  it('replaces the {R5_INJECT: ...} placeholder with the substitution text', () => {
    const out = substituteR5Placeholder(SAMPLE_DESC_BASE_WITH_PLACEHOLDER, 'I have been building X.');
    expect(out).toContain('I have been building X.');
    expect(out).not.toContain('{R5_INJECT');
  });

  it('is idempotent on input without a placeholder', () => {
    expect(substituteR5Placeholder(SAMPLE_DESC_BASE_NO_PLACEHOLDER, 'XXX')).toBe(SAMPLE_DESC_BASE_NO_PLACEHOLDER);
  });

  it('replaces every occurrence when more than one placeholder is present', () => {
    const multi = '{R5_INJECT: a} mid {R5_INJECT: b}';
    expect(substituteR5Placeholder(multi, '__')).toBe('__ mid __');
  });

  it('preserves the surrounding {R4_OPEN} / {R4_CLOSE} bookend placeholders', () => {
    const out = substituteR5Placeholder(SAMPLE_DESC_BASE_WITH_PLACEHOLDER, 'substituted');
    expect(out).toContain('{R4_OPEN}');
    expect(out).toContain('{R4_CLOSE}');
  });
});

describe('r5-injection — strategyDFallback()', () => {
  it('substitutes the placeholder with the D-fallback string for a known (signal_type, register)', () => {
    // TASK_REVIEW is a Class 1 signal_type with a 'formal' fallback per r5-fallbacks.ts.
    const out = strategyDFallback(SAMPLE_DESC_BASE_WITH_PLACEHOLDER, 'TASK_REVIEW', 'formal');
    expect(out).not.toContain('{R5_INJECT');
    expect(out).toContain('{R4_OPEN}');
  });

  it('returns the desc-base unchanged when no fallback exists for the (signal_type, register) pair', () => {
    const out = strategyDFallback(SAMPLE_DESC_BASE_WITH_PLACEHOLDER, 'NEVER_AUTHORED_SIGNAL_TYPE_XYZ', 'casual');
    expect(out).toBe(SAMPLE_DESC_BASE_WITH_PLACEHOLDER);
  });

  it('idempotent on input without a placeholder', () => {
    const out = strategyDFallback(SAMPLE_DESC_BASE_NO_PLACEHOLDER, 'TASK_REVIEW', 'formal');
    expect(out).toBe(SAMPLE_DESC_BASE_NO_PLACEHOLDER);
  });
});

describe('r5-injection — extractVocab()', () => {
  it('returns an empty array when history is empty', () => {
    expect(extractVocab([])).toEqual([]);
  });

  it('promotes a repeated word (appearing in ≥ 2 prompts) above other categories', () => {
    const history = [
      makePrompt('I am working on the invoice feature today.', 0),
      makePrompt('Still building the invoice rendering path.', 1),
    ];
    const vocab = extractVocab(history);
    // "invoice" appears in both prompts → must be highest-priority and in the result.
    expect(vocab[0].toLowerCase()).toBe('invoice');
  });

  it('picks verb stems out of single-prompt text', () => {
    const history = [makePrompt('I refactored the auth module and validated the new flow.', 0)];
    const vocab = extractVocab(history).map((t) => t.toLowerCase());
    expect(vocab.some((t) => t.startsWith('refactor'))).toBe(true);
    expect(vocab.some((t) => t.startsWith('validat'))).toBe(true);
  });

  it('picks noun-like tokens (camelCase, snake_case, file path) out of single-prompt text', () => {
    const history = [
      makePrompt('Editing the OptionGenerator file and user_profile schema in handler.ts today.', 0),
    ];
    const vocab = extractVocab(history);
    expect(vocab).toContain('OptionGenerator');
    expect(vocab).toContain('user_profile');
    expect(vocab).toContain('handler.ts');
  });

  it('caps the output at maxTokens (default 8)', () => {
    const sentence = 'I added building deploying running testing checking reviewing implementing committing pushing modules together.';
    const history = [makePrompt(sentence, 0)];
    const vocab = extractVocab(history);
    expect(vocab.length).toBeLessThanOrEqual(8);
  });

  it('honours an explicit maxTokens argument', () => {
    const history = [makePrompt('I added building deploying running testing checking reviewing implementing committing pushing modules together.', 0)];
    expect(extractVocab(history, 3).length).toBeLessThanOrEqual(3);
  });

  it('deduplicates case-variant occurrences (e.g., "Invoice" + "invoice")', () => {
    const history = [makePrompt('Invoice rendered, invoice tested, invoice ready.', 0)];
    const vocab = extractVocab(history);
    const lowered = vocab.map((t) => t.toLowerCase());
    const uniq = new Set(lowered);
    expect(uniq.size).toBe(lowered.length);
  });
});

describe('r5-injection — step-4.5 voice-rule filter', () => {
  it('drops bare "AI" / "Claude" / "assistant" / "it" / "its" tokens', () => {
    expect(isDroppedByVoiceRuleFilter('AI')).toBe(true);
    expect(isDroppedByVoiceRuleFilter('ai')).toBe(true);
    expect(isDroppedByVoiceRuleFilter('Claude')).toBe(true);
    expect(isDroppedByVoiceRuleFilter('assistant')).toBe(true);
    expect(isDroppedByVoiceRuleFilter('it')).toBe(true);
    expect(isDroppedByVoiceRuleFilter('Its')).toBe(true);
  });

  it('drops "you" / "your" tokens (USER-referent second-person)', () => {
    expect(isDroppedByVoiceRuleFilter('you')).toBe(true);
    expect(isDroppedByVoiceRuleFilter('Your')).toBe(true);
  });

  it('keeps first-person USER tokens', () => {
    expect(isDroppedByVoiceRuleFilter('I')).toBe(false);
    expect(isDroppedByVoiceRuleFilter('me')).toBe(false);
    expect(isDroppedByVoiceRuleFilter('my')).toBe(false);
  });

  it('keeps feature names / verbs / file paths', () => {
    expect(isDroppedByVoiceRuleFilter('OptionGenerator')).toBe(false);
    expect(isDroppedByVoiceRuleFilter('refactored')).toBe(false);
    expect(isDroppedByVoiceRuleFilter('handler.ts')).toBe(false);
  });

  it('applyVoiceRuleFilter strips banned tokens while preserving order', () => {
    const input = ['refactored', 'AI', 'OptionGenerator', 'you', 'me', 'Claude', 'invoice'];
    const out   = applyVoiceRuleFilter(input);
    expect(out).toEqual(['refactored', 'OptionGenerator', 'me', 'invoice']);
  });

  it('applyVoiceRuleFilter is non-destructive — returns a new array', () => {
    const input = ['a', 'AI', 'b'] as const;
    const out   = applyVoiceRuleFilter(input);
    expect(out).not.toBe(input as unknown as string[]);
    expect(input).toEqual(['a', 'AI', 'b']);
  });
});

describe('r5-injection — injectR5() entry point (skeleton)', () => {
  const history: readonly PromptRecord[] = [makePrompt('first prompt', 0), makePrompt('second prompt', 1)];

  it('returns the desc-base unchanged when no {R5_INJECT} placeholder is present', async () => {
    const out = await injectR5(SAMPLE_DESC_BASE_NO_PLACEHOLDER, history, 'TASK_REVIEW', 'formal');
    expect(out).toBe(SAMPLE_DESC_BASE_NO_PLACEHOLDER);
  });

  it('substitutes the placeholder via D-fallback (until Strategy C wires up)', async () => {
    const out = await injectR5(SAMPLE_DESC_BASE_WITH_PLACEHOLDER, history, 'TASK_REVIEW', 'formal');
    expect(out).not.toContain('{R5_INJECT');
    expect(out).toContain('{R4_OPEN}');
    expect(out).toContain('{R4_CLOSE}');
  });

  it('returns the desc-base unchanged when the (signal_type, register) pair has no fallback', async () => {
    const out = await injectR5(
      SAMPLE_DESC_BASE_WITH_PLACEHOLDER,
      history,
      'NEVER_AUTHORED_SIGNAL_TYPE_XYZ',
      'casual',
    );
    expect(out).toBe(SAMPLE_DESC_BASE_WITH_PLACEHOLDER);
  });

  it('accepts all 3 R5Register values without throwing', async () => {
    const registers: R5Register[] = ['formal', 'casual', 'beginner'];
    for (const reg of registers) {
      const out = await injectR5(SAMPLE_DESC_BASE_NO_PLACEHOLDER, history, 'TASK_REVIEW', reg);
      expect(typeof out).toBe('string');
    }
  });
});
