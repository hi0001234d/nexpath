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
  f1ShouldFallback,
  f2MaskPromptHistory,
  maskSecretsInText,
  f4EnforceLengthCap,
  f5DeduplicatePrompts,
  f7DetectL2Triggers,
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

describe('r5-injection — F1 early-session guard', () => {
  it('returns true for empty history', () => {
    expect(f1ShouldFallback([])).toBe(true);
  });
  it('returns true for history with a single prompt', () => {
    expect(f1ShouldFallback([makePrompt('alone', 0)])).toBe(true);
  });
  it('returns false for history with two or more prompts', () => {
    expect(f1ShouldFallback([makePrompt('a', 0), makePrompt('b', 1)])).toBe(false);
  });
});

describe('r5-injection — F2 PII / secret masking', () => {
  it('redacts api key pattern', () => {
    expect(maskSecretsInText('api_key=sk-ABCD1234EFGH5678')).toContain('[REDACTED_SECRET]');
  });
  it('redacts email addresses', () => {
    expect(maskSecretsInText('mail me at foo@example.com please')).toContain('[REDACTED_EMAIL]');
  });
  it('redacts IPv4-shaped patterns', () => {
    expect(maskSecretsInText('connect to 192.168.0.1 today')).toContain('[REDACTED_IP]');
  });
  it('redacts secret-store paths (.env / .ssh / .pem / .key)', () => {
    expect(maskSecretsInText('cat ~/.ssh/id_rsa')).toContain('[REDACTED_SECRET_PATH]');
    expect(maskSecretsInText('open .env now')).toContain('[REDACTED_SECRET_PATH]');
    expect(maskSecretsInText('use cert.pem with the request')).toContain('[REDACTED_SECRET_PATH]');
  });
  it('does NOT redact non-secret file paths', () => {
    expect(maskSecretsInText('edit src/api/handler.ts now')).toContain('src/api/handler.ts');
  });
  it('f2MaskPromptHistory returns a new array with masked text in each entry', () => {
    const history = [makePrompt('email foo@bar.com', 0), makePrompt('clean', 1)];
    const out = f2MaskPromptHistory(history);
    expect(out).toHaveLength(2);
    expect(out[0].text).toContain('[REDACTED_EMAIL]');
    expect(out[1].text).toBe('clean');
  });
});

describe('r5-injection — F4 per-substitution length cap', () => {
  it('returns the input unchanged when within both line and char caps', () => {
    const ok = 'One line.';
    expect(f4EnforceLengthCap(ok)).toBe(ok);
  });
  it('truncates at sentence boundary when char cap is exceeded', () => {
    const long = 'This is the first sentence. ' + 'a'.repeat(200);
    const out = f4EnforceLengthCap(long);
    expect(out).toBe('This is the first sentence.');
  });
  it('returns null when no clean sentence-boundary truncation is possible', () => {
    const noBoundary = 'a'.repeat(200);
    expect(f4EnforceLengthCap(noBoundary)).toBeNull();
  });
});

describe('r5-injection — F5 deduplicate prompts', () => {
  it('removes verbatim repeated prompts preserving first occurrence', () => {
    const history = [
      makePrompt('fix the bug', 0),
      makePrompt('something else', 1),
      makePrompt('Fix the bug', 2),       // case-insensitive duplicate
      makePrompt('fix   the    bug', 3),  // whitespace-normalised duplicate
    ];
    const out = f5DeduplicatePrompts(history);
    expect(out).toHaveLength(2);
    expect(out[0].text).toBe('fix the bug');
    expect(out[1].text).toBe('something else');
  });
  it('returns identical array when no duplicates are present', () => {
    const history = [makePrompt('a', 0), makePrompt('b', 1), makePrompt('c', 2)];
    expect(f5DeduplicatePrompts(history)).toHaveLength(3);
  });
});

describe('r5-injection — F7 L2 sensitive-action trigger detection', () => {
  it('detects destructive-fs / schema-migration / deployment triggers', () => {
    const history = [
      makePrompt('Run rm -rf /tmp/output to clean up', 0),
      makePrompt('Migrate the users table to add the new column', 1),
      makePrompt('Finally deploy to staging', 2),
    ];
    const triggers = f7DetectL2Triggers(history);
    expect(triggers).toContain('destructive-fs');
    expect(triggers).toContain('schema-migration');
    expect(triggers).toContain('deployment');
  });
  it('returns an empty array when no triggers are present', () => {
    const history = [
      makePrompt('I am refactoring the parser', 0),
      makePrompt('Adding tests for the new branch', 1),
    ];
    expect(f7DetectL2Triggers(history)).toEqual([]);
  });
  it('deduplicates the trigger-name set when multiple prompts hit the same category', () => {
    const history = [
      makePrompt('deploy to prod', 0),
      makePrompt('release the new build', 1),
    ];
    const triggers = f7DetectL2Triggers(history);
    expect(triggers.filter((t) => t === 'deployment')).toHaveLength(1);
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
