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
  buildRewritePrompt,
  calculateUserVocabConcentration,
  meetsConcentrationThreshold,
  rewriteViaLLM,
  CONCENTRATION_THRESHOLD,
  type R5Register,
  type R5RewriteClient,
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

describe('r5-injection — buildRewritePrompt()', () => {
  it('includes the signal type, register, vocab JSON, and example hint in the prompt', () => {
    const prompt = buildRewritePrompt(
      ['invoice', 'building'],
      'TASK_REVIEW',
      'formal',
      '"I have been building the invoice path"',
    );
    expect(prompt).toContain('TASK_REVIEW');
    expect(prompt).toContain('formal');
    expect(prompt).toContain('invoice');
    expect(prompt).toContain('building');
    expect(prompt).toContain('I have been building the invoice path');
  });

  it('uses third-person register instruction for formal', () => {
    expect(buildRewritePrompt([], 'X', 'formal', '')).toContain('third-person');
  });

  it('uses first-person register instruction for casual + beginner', () => {
    expect(buildRewritePrompt([], 'X', 'casual',   '')).toContain('first-person');
    expect(buildRewritePrompt([], 'X', 'beginner', '')).toContain('first-person');
  });

  it('embeds the L1 voice-rule guard against banned tokens', () => {
    const prompt = buildRewritePrompt([], 'X', 'formal', '');
    expect(prompt).toContain('"AI"');
    expect(prompt).toContain('"Claude"');
    expect(prompt).toContain('"you"');
  });
});

describe('r5-injection — calculateUserVocabConcentration()', () => {
  it('returns 0 when the summary is empty', () => {
    expect(calculateUserVocabConcentration('', ['x'])).toBe(0);
  });
  it('returns 1 when every summary word comes from vocab', () => {
    expect(calculateUserVocabConcentration('invoice building', ['invoice', 'building'])).toBe(1);
  });
  it('returns the correct fraction for a partial overlap', () => {
    // "I have been building the invoice today" — 7 words, 2 from vocab → 2/7 ≈ 0.286
    const fraction = calculateUserVocabConcentration('I have been building the invoice today', ['building', 'invoice']);
    expect(fraction).toBeCloseTo(2 / 7, 5);
  });
  it('comparison is case-insensitive', () => {
    expect(calculateUserVocabConcentration('Invoice INVOICE invoice', ['invoice'])).toBe(1);
  });
});

describe('r5-injection — meetsConcentrationThreshold()', () => {
  it('returns true when fraction ≥ 70%', () => {
    // 7 words from vocab + 3 connectors = 10 words, 7/10 = 0.7 → meets threshold
    const summary = 'invoice building refactor deploy commit push merge has been today';
    const vocab   = ['invoice', 'building', 'refactor', 'deploy', 'commit', 'push', 'merge'];
    expect(meetsConcentrationThreshold(summary, vocab)).toBe(true);
  });
  it('returns false when fraction < 70%', () => {
    expect(meetsConcentrationThreshold('many of the the very plain filler words and only one invoice', ['invoice'])).toBe(false);
  });
  it('CONCENTRATION_THRESHOLD is 0.7', () => {
    expect(CONCENTRATION_THRESHOLD).toBe(0.7);
  });
});

describe('r5-injection — rewriteViaLLM()', () => {
  it('returns the client output verbatim on success', async () => {
    const client: R5RewriteClient = {
      rewrite: async () => "I've been building the invoice flow today.",
    };
    const out = await rewriteViaLLM(['invoice'], 'TASK_REVIEW', 'casual', '"example"', client);
    expect(out).toBe("I've been building the invoice flow today.");
  });

  it('returns empty string when the client throws — never propagates', async () => {
    const client: R5RewriteClient = {
      rewrite: async () => { throw new Error('boom'); },
    };
    const out = await rewriteViaLLM(['x'], 'Y', 'formal', '', client);
    expect(out).toBe('');
  });
});

describe('r5-injection — injectR5() full orchestration', () => {
  const richHistory: readonly PromptRecord[] = [
    makePrompt('I have been refactoring the invoice rendering path today.', 0),
    makePrompt('Building the invoice and validating with tests now.', 1),
  ];

  it('returns the desc-base unchanged when no {R5_INJECT} placeholder is present', async () => {
    const out = await injectR5(SAMPLE_DESC_BASE_NO_PLACEHOLDER, richHistory, 'TASK_REVIEW', 'formal');
    expect(out).toBe(SAMPLE_DESC_BASE_NO_PLACEHOLDER);
  });

  it('falls back to D when history is too short (F1)', async () => {
    const short = [makePrompt('only one prompt', 0)];
    const out = await injectR5(SAMPLE_DESC_BASE_WITH_PLACEHOLDER, short, 'TASK_REVIEW', 'formal');
    expect(out).not.toContain('{R5_INJECT');  // substitution happened via D-fallback
  });

  it('falls back to D when no client is provided (Strategy-C skipped)', async () => {
    const out = await injectR5(SAMPLE_DESC_BASE_WITH_PLACEHOLDER, richHistory, 'TASK_REVIEW', 'formal');
    expect(out).not.toContain('{R5_INJECT');
  });

  it('uses Strategy-C output when client + concentration + length all pass', async () => {
    const client: R5RewriteClient = {
      // Output that hits ≥ 70% concentration on the extracted vocab.
      rewrite: async () => 'refactoring invoice building validating tests now.',
    };
    const out = await injectR5(
      SAMPLE_DESC_BASE_WITH_PLACEHOLDER,
      richHistory,
      'TASK_REVIEW',
      'formal',
      { client, exampleHint: '"example shape"' },
    );
    expect(out).toContain('refactoring invoice');
    expect(out).not.toContain('{R5_INJECT');
  });

  it('falls back to D when the LLM output fails the 70-80% concentration check', async () => {
    const client: R5RewriteClient = {
      rewrite: async () => 'Generic filler text that has no grounding in the user vocabulary at all.',
    };
    const out = await injectR5(
      SAMPLE_DESC_BASE_WITH_PLACEHOLDER,
      richHistory,
      'TASK_REVIEW',
      'formal',
      { client, exampleHint: '"example"' },
    );
    // D-fallback substitution — does not contain the generic LLM output.
    expect(out).not.toContain('Generic filler text');
    expect(out).not.toContain('{R5_INJECT');
  });

  it('falls back to D when the LLM output exceeds F4 length cap with no clean truncation', async () => {
    const client: R5RewriteClient = {
      rewrite: async () => 'a'.repeat(200),  // 200-char single-token, no sentence boundary
    };
    const out = await injectR5(
      SAMPLE_DESC_BASE_WITH_PLACEHOLDER,
      richHistory,
      'TASK_REVIEW',
      'formal',
      { client, exampleHint: '' },
    );
    expect(out).not.toContain('aaaaaa');  // raw model output never appears
    expect(out).not.toContain('{R5_INJECT');
  });

  it('falls back to D when client throws', async () => {
    const client: R5RewriteClient = { rewrite: async () => { throw new Error('boom'); } };
    const out = await injectR5(
      SAMPLE_DESC_BASE_WITH_PLACEHOLDER,
      richHistory,
      'TASK_REVIEW',
      'formal',
      { client, exampleHint: '' },
    );
    expect(out).not.toContain('{R5_INJECT');
  });

  it('returns the desc-base unchanged when the (signal_type, register) pair has no fallback', async () => {
    const out = await injectR5(
      SAMPLE_DESC_BASE_WITH_PLACEHOLDER,
      richHistory,
      'NEVER_AUTHORED_SIGNAL_TYPE_XYZ',
      'casual',
    );
    expect(out).toBe(SAMPLE_DESC_BASE_WITH_PLACEHOLDER);
  });

  it('accepts all 3 R5Register values without throwing', async () => {
    const registers: R5Register[] = ['formal', 'casual', 'beginner'];
    for (const reg of registers) {
      const out = await injectR5(SAMPLE_DESC_BASE_NO_PLACEHOLDER, richHistory, 'TASK_REVIEW', reg);
      expect(typeof out).toBe('string');
    }
  });
});
