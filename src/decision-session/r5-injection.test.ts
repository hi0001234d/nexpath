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
  computeRepetitionCounts,
  f7DetectL2Triggers,
  f7DetectL2TriggerMatches,
  buildRewritePrompt,
  calculateUserVocabConcentration,
  meetsConcentrationThreshold,
  rewriteViaLLM,
  CONCENTRATION_THRESHOLD,
  fitsLengthBudget,
  LENGTH_BUDGETS,
  buildL2SafeguardSentence,
  stripL2TriggerText,
  appendL2Safeguard,
  type R5Register,
  type R5RewriteClient,
  type LengthBudgetTier,
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

describe('r5-injection — F2 password masking (dev-plan §10.6 F2 token list)', () => {
  it('redacts password=<value> assignments', () => {
    expect(maskSecretsInText('password=supersecret12 thanks')).toContain('[REDACTED_SECRET]');
    expect(maskSecretsInText('password=supersecret12 thanks')).not.toContain('supersecret12');
  });

  it('redacts password: <value> assignments', () => {
    expect(maskSecretsInText('password: hunter2lol next steps')).toContain('[REDACTED_SECRET]');
    expect(maskSecretsInText('password: hunter2lol next steps')).not.toContain('hunter2lol');
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

describe('r5-injection — computeRepetitionCounts() F5 repetition signal', () => {
  it('returns tokens appearing in ≥ 2 distinct prompts with their cross-prompt counts', () => {
    const history = [
      makePrompt('fix this bug',         0),
      makePrompt('fix this bug',         1),
      makePrompt('fix this bug please',  2),
      makePrompt('still broken, fix this bug', 3),
      makePrompt('fix this bug now',     4),
    ];
    const reps = computeRepetitionCounts(history);
    const fix = reps.find((r) => r.token.toLowerCase() === 'fix');
    const bug = reps.find((r) => r.token.toLowerCase() === 'bug');
    expect(fix?.promptCount).toBe(5);
    expect(bug?.promptCount).toBe(5);
  });

  it('returns an empty array when no token repeats across prompts', () => {
    const history = [
      makePrompt('alpha beta',  0),
      makePrompt('gamma delta', 1),
    ];
    expect(computeRepetitionCounts(history)).toEqual([]);
  });

  it('skips stopwords + tokens shorter than 2 chars', () => {
    const history = [
      makePrompt('I have been refactoring', 0),
      makePrompt('I have been writing tests', 1),
    ];
    const reps = computeRepetitionCounts(history);
    // Stopwords ("i", "have", "been") never appear in the result.
    expect(reps.find((r) => r.token.toLowerCase() === 'i')).toBeUndefined();
    expect(reps.find((r) => r.token.toLowerCase() === 'have')).toBeUndefined();
    expect(reps.find((r) => r.token.toLowerCase() === 'been')).toBeUndefined();
  });

  it('sorts results by promptCount descending', () => {
    const history = [
      makePrompt('alpha beta gamma',       0),
      makePrompt('alpha beta',             1),
      makePrompt('alpha somethingother',   2),
      makePrompt('beta yetanother',        3),
    ];
    // alpha appears in 3 prompts, beta in 3 prompts — both kept; ordering by count desc.
    const reps = computeRepetitionCounts(history);
    expect(reps[0].promptCount).toBeGreaterThanOrEqual(reps[reps.length - 1].promptCount);
  });

  it('counts a token ONCE per prompt even when it appears multiple times within the same prompt', () => {
    const history = [
      makePrompt('fix fix fix',  0),
      makePrompt('fix something else', 1),
    ];
    const reps = computeRepetitionCounts(history);
    const fix = reps.find((r) => r.token.toLowerCase() === 'fix');
    expect(fix?.promptCount).toBe(2);  // 2 distinct prompts, not 4 total occurrences
  });
});

describe('r5-injection — buildRewritePrompt() F5 repetition hint', () => {
  it('omits the repetition hint section when no repetitions are passed', () => {
    const prompt = buildRewritePrompt(['foo', 'bar'], 'TASK_REVIEW', 'casual', '');
    expect(prompt).not.toContain('appeared in multiple distinct');
    expect(prompt).not.toContain('Reflect this repetition naturally');
  });

  it('includes the repetition hint listing tokens with their cross-prompt counts when repetitions are present', () => {
    const prompt = buildRewritePrompt(
      ['fix', 'bug'],
      'TASK_REVIEW',
      'casual',
      '',
      [
        { token: 'fix', promptCount: 5 },
        { token: 'bug', promptCount: 5 },
      ],
    );
    expect(prompt).toContain('appeared in multiple distinct user prompts');
    expect(prompt).toContain('fix (×5)');
    expect(prompt).toContain('bug (×5)');
    expect(prompt).toContain('Reflect this repetition naturally');
  });
});

describe('r5-injection — F5 hint flows from injectR5 to the rewrite client', () => {
  it('passes the repetition hint to the rewrite client when prompts contain repeated tokens', async () => {
    const history = [
      makePrompt('I have been refactoring the parser and adding tests', 0),
      makePrompt('I keep refactoring the parser and the test plan',     1),
      makePrompt('Still refactoring the parser today',                  2),
    ];
    let captured = '';
    const client: R5RewriteClient = {
      rewrite: async (p) => { captured = p; return 'parser refactoring tests'; },
    };
    await injectR5(SAMPLE_DESC_BASE_WITH_PLACEHOLDER, history, 'TASK_REVIEW', 'formal', {
      client,
      exampleHint:   '',
      lengthBudget:  'HEAVY',
    });
    expect(captured).toContain('appeared in multiple distinct');
    expect(captured.toLowerCase()).toContain('parser');
    expect(captured.toLowerCase()).toContain('refactoring');
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

  it('detects deployment via the standalone "prod" shorthand (dev-plan §10.6.1 token list)', () => {
    const history = [makePrompt('ship the build to prod tomorrow', 0)];
    expect(f7DetectL2Triggers(history)).toContain('deployment');
  });

  it('detects secret-env via the standalone "env" token (dev-plan §10.6.1 token list)', () => {
    const history = [makePrompt('let me read env to debug', 0)];
    expect(f7DetectL2Triggers(history)).toContain('secret-env');
  });

  it('detects destroy/wipe/purge/erase under destructive-fs (extended sensitive-verb list)', () => {
    expect(f7DetectL2Triggers([makePrompt('destroy the temp dir', 0)])).toContain('destructive-fs');
    expect(f7DetectL2Triggers([makePrompt('wipe the cache directory', 0)])).toContain('destructive-fs');
    expect(f7DetectL2Triggers([makePrompt('purge the old logs', 0)])).toContain('destructive-fs');
    expect(f7DetectL2Triggers([makePrompt('erase the snapshot', 0)])).toContain('destructive-fs');
  });

  it('fires on a single occurrence — no repetition / divergence pattern required', () => {
    // Per dev-plan §10.6.1 category 8 reinterpretation: a sensitive verb
    // triggers regardless of how many prompts it appears in.
    const single = [makePrompt('alpha bravo charlie wipe the staging cache', 0)];
    expect(f7DetectL2Triggers(single)).toContain('destructive-fs');
  });
});

describe('r5-injection — f7DetectL2TriggerMatches() literal-text variant', () => {
  it('returns the literal matched text and prompt index for each detection', () => {
    const matches = f7DetectL2TriggerMatches([
      makePrompt('Please rm -rf /tmp/garbage now', 0),
      makePrompt('Migrate the users table to add the new column', 1),
    ]);
    const fs = matches.find((m) => m.name === 'destructive-fs');
    const sm = matches.find((m) => m.name === 'schema-migration');
    expect(fs?.matchedText).toBe('rm -rf');
    expect(fs?.promptIndex).toBe(0);
    expect(sm?.matchedText.toLowerCase()).toBe('migrate');
    expect(sm?.promptIndex).toBe(1);
  });

  it('preserves prompt order and pattern iteration order — first prompt\'s first matching category appears first', () => {
    const matches = f7DetectL2TriggerMatches([
      makePrompt('Need to deploy and also migrate later', 0),
      makePrompt('rm -rf the temp folder', 1),
    ]);
    // Prompt 0 matches deployment + schema-migration (in pattern-table order),
    // prompt 1 matches destructive-fs. The first element comes from prompt 0.
    expect(matches[0].promptIndex).toBe(0);
  });

  it('normalises whitespace inside the matched span', () => {
    const matches = f7DetectL2TriggerMatches([
      makePrompt('please force  push the branch', 0),  // double space inside match
    ]);
    const fp = matches.find((m) => m.name === 'force-push');
    expect(fp?.matchedText).toBe('force push');  // single space after normalisation
  });

  it('returns an empty array when no triggers match', () => {
    const matches = f7DetectL2TriggerMatches([
      makePrompt('I am refactoring the parser', 0),
      makePrompt('Adding tests for the new branch', 1),
    ]);
    expect(matches).toEqual([]);
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
      // 5-line fixture overflows MEDIUM (4); HEAVY accommodates it.
      { client, exampleHint: '"example shape"', lengthBudget: 'HEAVY' },
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

  it('F3 — static gap-framing + direction-body lines survive R5 substitution verbatim (no contradiction handler needed)', async () => {
    // F3 has no runtime handler by design (dev plan §10.6 F3 row).
    // This test locks the invariant: only the {R5_INJECT} slot is
    // touched; the static gap-framing line + direction-body line
    // pass through unchanged regardless of what the LLM rewrite
    // (or Strategy-D fallback) produces.
    const GAP_FRAMING    = 'STATIC_GAP_FRAMING_SENTENCE_DO_NOT_TOUCH.';
    const DIRECTION_BODY = 'STATIC_DIRECTION_BODY_SENTENCE_DO_NOT_TOUCH.';
    const desc = [
      '{R4_OPEN}',
      '{R5_INJECT: ~1 line — "example"}',
      GAP_FRAMING,
      DIRECTION_BODY,
      '{R4_CLOSE}',
    ].join('\n');

    // Path A — Strategy-C with a permissive rewrite client.
    const client: R5RewriteClient = {
      rewrite: async () => 'refactoring invoice building rendering service today.',
    };
    const outC = await injectR5(
      desc,
      [
        makePrompt('I have been refactoring the invoice rendering path today.', 0),
        makePrompt('Building the invoice and validating with tests now.',       1),
      ],
      'TASK_REVIEW',
      'formal',
      { client, exampleHint: '', lengthBudget: 'HEAVY' },
    );
    expect(outC).toContain(GAP_FRAMING);
    expect(outC).toContain(DIRECTION_BODY);

    // Path B — Strategy-D (no client bound) over the same template.
    const outD = await injectR5(
      desc,
      [
        makePrompt('I have been refactoring the invoice rendering path today.', 0),
        makePrompt('Building the invoice and validating with tests now.',       1),
      ],
      'TASK_REVIEW',
      'formal',
      { exampleHint: '', lengthBudget: 'HEAVY' },
    );
    expect(outD).toContain(GAP_FRAMING);
    expect(outD).toContain(DIRECTION_BODY);
  });

  it('falls back to Strategy D when F2 masking + F7 stripping leave fewer than 2 useful tokens (dev plan §10.1 step 3)', async () => {
    // Every meaningful word in these prompts matches a redaction
    // pattern: API key + email + secret-store path. After masking,
    // only the redaction markers remain — extractVocab returns no
    // useful tokens, and the runtime must fall back to D before
    // reaching the voice-rule filter.
    const history: PromptRecord[] = [
      makePrompt('api_key=abc12345def67890 contact dev@example.com',  0),
      makePrompt('check ~/.aws/credentials and ~/.ssh/id_rsa next',   1),
    ];
    let rewriteCalled = false;
    const client: R5RewriteClient = {
      rewrite: async () => { rewriteCalled = true; return 'should never run'; },
    };
    const out = await injectR5(
      SAMPLE_DESC_BASE_WITH_PLACEHOLDER,
      history,
      'TASK_REVIEW',
      'formal',
      { client, exampleHint: '', lengthBudget: 'HEAVY' },
    );
    // No rewrite call — the early <2 check exits before the LLM step.
    expect(rewriteCalled).toBe(false);
    // R5 placeholder substituted via Strategy D (TASK_REVIEW has a D-fallback authored).
    expect(out).not.toContain('{R5_INJECT');
    expect(out).not.toContain('should never run');
  });
});

describe('r5-injection — fitsLengthBudget() helper', () => {
  it('returns true when the desc-base is below the tier ceiling on both lines and chars', () => {
    expect(fitsLengthBudget('one\ntwo', 'LIGHT')).toBe(true);
    expect(fitsLengthBudget('a'.repeat(150), 'LIGHT')).toBe(true);
  });

  it('returns false when the char count exceeds the tier ceiling', () => {
    expect(fitsLengthBudget('a'.repeat(201),  'LIGHT')).toBe(false);
    expect(fitsLengthBudget('a'.repeat(401),  'MEDIUM')).toBe(false);
    expect(fitsLengthBudget('a'.repeat(1001), 'HEAVY')).toBe(false);
  });

  it('returns false when the line count exceeds the tier ceiling', () => {
    expect(fitsLengthBudget('a\nb\nc',                'LIGHT')).toBe(false);   // 3 > 2
    expect(fitsLengthBudget('a\nb\nc\nd\ne',          'MEDIUM')).toBe(false);  // 5 > 4
    expect(fitsLengthBudget('a\n'.repeat(10) + 'end', 'HEAVY')).toBe(false);   // 11 > 10
  });

  it('exposes the locked tier ceilings as LENGTH_BUDGETS', () => {
    expect(LENGTH_BUDGETS.LIGHT).toEqual({  maxExpandedLines: 2,  maxChars: 200  });
    expect(LENGTH_BUDGETS.MEDIUM).toEqual({ maxExpandedLines: 4,  maxChars: 400  });
    expect(LENGTH_BUDGETS.HEAVY).toEqual({  maxExpandedLines: 10, maxChars: 1000 });
  });
});

describe('r5-injection — per-set total length budget (§10.1.2)', () => {
  const groundedHistory: readonly PromptRecord[] = [
    makePrompt('I have been refactoring the invoice rendering path today.', 0),
    makePrompt('Building the invoice and validating with tests now.', 1),
  ];

  // High-concentration rewrite client — output uses extracted vocab.
  const echoClient: R5RewriteClient = {
    rewrite: async () => 'refactoring invoice building validating tests now.',
  };

  it('returns the substituted desc-base when total length is within the tier (LIGHT clean path)', async () => {
    // Single-placeholder desc-base — total ≤ 200 chars + ≤ 2 lines after substitution.
    const shortTemplate = '{R5_INJECT: ~1 line — "example"}';
    const out = await injectR5(
      shortTemplate,
      groundedHistory,
      'TASK_REVIEW',
      'formal',
      { client: echoClient, exampleHint: '', lengthBudget: 'LIGHT' },
    );
    expect(out).toContain('refactoring invoice');
    expect(out).not.toContain('{R5_INJECT');
    expect(out.length).toBeLessThanOrEqual(LENGTH_BUDGETS.LIGHT.maxChars);
  });

  it('falls back to Strategy D when LIGHT total-length ceiling is exceeded', async () => {
    // Template padded so total post-substitution > 200 chars even with capped R5 output.
    const padded = `${'A'.repeat(190)}\n{R5_INJECT: ~1 line — "example"}`;
    const out = await injectR5(
      padded,
      groundedHistory,
      'TASK_REVIEW',          // has a D-fallback registered
      'formal',
      { client: echoClient, exampleHint: '', lengthBudget: 'LIGHT' },
    );
    // Strategy D was applied — the LLM rewrite output is absent.
    expect(out).not.toContain('refactoring invoice');
    expect(out).not.toContain('{R5_INJECT');
  });

  it('defaults to MEDIUM when lengthBudget is omitted', async () => {
    // Padded between LIGHT (200) and MEDIUM (400) ceilings, fits MEDIUM cleanly.
    const padded = `${'B'.repeat(250)}\n{R5_INJECT: ~1 line — "example"}`;
    const out = await injectR5(
      padded,
      groundedHistory,
      'TASK_REVIEW',
      'formal',
      { client: echoClient, exampleHint: '' },
      // lengthBudget omitted → defaults to MEDIUM (400 char ceiling)
    );
    expect(out).toContain('refactoring invoice');
  });

  it('allows up to ~1000 chars when HEAVY tier is set', async () => {
    // Padded between MEDIUM (400) and HEAVY (1000) ceilings.
    const padded = `${'C'.repeat(800)}\n{R5_INJECT: ~1 line — "example"}`;
    const out = await injectR5(
      padded,
      groundedHistory,
      'TASK_REVIEW',
      'formal',
      { client: echoClient, exampleHint: '', lengthBudget: 'HEAVY' },
    );
    expect(out).toContain('refactoring invoice');
    expect(out.length).toBeGreaterThan(LENGTH_BUDGETS.MEDIUM.maxChars);
  });

  it('falls back to Strategy D when expanded line count exceeds the tier ceiling', async () => {
    // 3 lines from template + 1 line of R5 substitution = 4 lines total > LIGHT.maxExpandedLines (2).
    const multiLineTemplate = 'line 1\nline 2\nline 3\n{R5_INJECT: ~1 line — "example"}';
    const out = await injectR5(
      multiLineTemplate,
      groundedHistory,
      'TASK_REVIEW',
      'formal',
      { client: echoClient, exampleHint: '', lengthBudget: 'LIGHT' },
    );
    expect(out).not.toContain('refactoring invoice');
    expect(out).not.toContain('{R5_INJECT');
  });

  // LengthBudgetTier type-only assertion — ensures the type is exported and usable.
  it('exports a LengthBudgetTier type covering the three locked tiers', () => {
    const tiers: LengthBudgetTier[] = ['LIGHT', 'MEDIUM', 'HEAVY'];
    expect(tiers).toHaveLength(3);
  });
});

describe('r5-injection — F7 helpers', () => {
  it('buildL2SafeguardSentence plugs the literal user-prompt matched text into the <action> slot', () => {
    expect(
      buildL2SafeguardSentence([{ name: 'destructive-fs', matchedText: 'rm -rf', promptIndex: 0 }]),
    ).toBe('Still, before you do this rm -rf you must ask me for go-ahead confirmation.');
    expect(
      buildL2SafeguardSentence([{ name: 'schema-migration', matchedText: 'migrate', promptIndex: 0 }]),
    ).toBe('Still, before you do this migrate you must ask me for go-ahead confirmation.');
    expect(
      buildL2SafeguardSentence([{ name: 'deployment', matchedText: 'deploy', promptIndex: 0 }]),
    ).toBe('Still, before you do this deploy you must ask me for go-ahead confirmation.');
  });

  it('buildL2SafeguardSentence uses ONLY the first match when multiple matches are passed', () => {
    expect(
      buildL2SafeguardSentence([
        { name: 'deployment',       matchedText: 'deploy',   promptIndex: 0 },
        { name: 'schema-migration', matchedText: 'migrate',  promptIndex: 1 },
      ]),
    ).toBe('Still, before you do this deploy you must ask me for go-ahead confirmation.');
  });

  it('buildL2SafeguardSentence falls back to a generic phrase only when match list is empty', () => {
    expect(buildL2SafeguardSentence([])).toBe(
      'Still, before you do this this sensitive action you must ask me for go-ahead confirmation.',
    );
  });

  it('stripL2TriggerText removes L2 trigger phrases from each prompt while preserving other text', () => {
    const stripped = stripL2TriggerText([
      makePrompt('Please migrate the users table and write a unit test for it.', 0),
      makePrompt('Then deploy to production and let me know.', 1),
    ]);
    expect(stripped[0].text).not.toMatch(/migrate/i);
    expect(stripped[0].text).toContain('unit test');
    expect(stripped[1].text).not.toMatch(/deploy/i);
    expect(stripped[1].text).not.toMatch(/production/i);
  });

  it('appendL2Safeguard inserts the sentence (with literal action) before {R4_CLOSE} when present', () => {
    const desc = 'body line\n{R4_CLOSE}';
    const out  = appendL2Safeguard(desc, [
      { name: 'destructive-fs', matchedText: 'rm -rf', promptIndex: 0 },
    ]);
    expect(out).toContain('Still, before you do this rm -rf you must ask me for go-ahead confirmation.');
    // R4_CLOSE remains on its own trailing line.
    expect(out.endsWith('{R4_CLOSE}')).toBe(true);
  });

  it('appendL2Safeguard appends at the end when {R4_CLOSE} is not present', () => {
    const desc = 'body line only';
    const out  = appendL2Safeguard(desc, [
      { name: 'deployment', matchedText: 'deploy', promptIndex: 0 },
    ]);
    expect(out.startsWith('body line only\n')).toBe(true);
    expect(out).toContain('Still, before you do this deploy');
  });

  it('appendL2Safeguard returns the desc-base unchanged when no matches are passed', () => {
    expect(appendL2Safeguard('body\n{R4_CLOSE}', [])).toBe('body\n{R4_CLOSE}');
  });
});

describe('r5-injection — F7 two-tier orchestration (§10.6.1)', () => {
  // History with one L2 trigger ("deploy to production") plus enough other
  // tokens to keep vocab extraction non-empty after the trigger words are
  // stripped.
  const l2History: readonly PromptRecord[] = [
    makePrompt('I have been refactoring the invoice rendering path today.', 0),
    makePrompt('Building the invoice service and getting ready to deploy to production.', 1),
  ];

  const echoClient: R5RewriteClient = {
    rewrite: async () => 'refactoring invoice building rendering service today.',
  };

  it('path (a) — appends the safeguard sentence with the literal user-prompt L2 verb when triggers present AND static is L2-clean', async () => {
    const out = await injectR5(
      SAMPLE_DESC_BASE_WITH_PLACEHOLDER,
      l2History,
      'TASK_REVIEW',
      'formal',
      {
        client: echoClient,
        exampleHint: '',
        lengthBudget: 'HEAVY',
        // l2SafeguardRequired omitted — i.e. static is L2-clean → escalate.
      },
    );
    // The literal "deploy" word from the user's prompt fills the <action> slot.
    expect(out).toContain('Still, before you do this deploy you must ask me for go-ahead confirmation.');
  });

  it('path (b) — does NOT append safeguard when static is already L2-flagged', async () => {
    const out = await injectR5(
      SAMPLE_DESC_BASE_WITH_PLACEHOLDER,
      l2History,
      'TASK_REVIEW',
      'formal',
      {
        client: echoClient,
        exampleHint: '',
        lengthBudget: 'HEAVY',
        l2SafeguardRequired: true,
      },
    );
    expect(out).not.toContain('Still, before you');
  });

  it('drops L2 trigger words from the vocab so they cannot leak into the rewrite output', async () => {
    // A capturing client returns the vocab JSON array verbatim so the test
    // can assert which tokens reached the LLM step.
    let capturedPrompt = '';
    const captureClient: R5RewriteClient = {
      rewrite: async (prompt: string) => {
        capturedPrompt = prompt;
        return 'refactoring invoice building rendering service today.';
      },
    };
    await injectR5(
      SAMPLE_DESC_BASE_WITH_PLACEHOLDER,
      l2History,
      'TASK_REVIEW',
      'formal',
      { client: captureClient, exampleHint: '', lengthBudget: 'HEAVY' },
    );
    // The trigger words were stripped before vocab extraction.
    expect(capturedPrompt).not.toMatch(/"deploy"/i);
    expect(capturedPrompt).not.toMatch(/"production"/i);
    // Other user tokens still survived.
    expect(capturedPrompt).toMatch(/invoice|refactoring|rendering/i);
  });

  it('no-op when history contains no L2 triggers — safeguard NOT appended', async () => {
    const cleanHistory: readonly PromptRecord[] = [
      makePrompt('I have been refactoring the invoice rendering path today.', 0),
      makePrompt('Building the invoice service with new feature notes.', 1),
    ];
    const out = await injectR5(
      SAMPLE_DESC_BASE_WITH_PLACEHOLDER,
      cleanHistory,
      'TASK_REVIEW',
      'formal',
      { client: echoClient, exampleHint: '', lengthBudget: 'HEAVY' },
    );
    expect(out).not.toContain('Still, before you');
  });

  it('safeguard still applied when the path falls back to Strategy D (no rewrite client)', async () => {
    const out = await injectR5(
      SAMPLE_DESC_BASE_WITH_PLACEHOLDER,
      l2History,
      'TASK_REVIEW',
      'formal',
      { lengthBudget: 'HEAVY' },  // no client → Strategy D
    );
    // D-fallback substituted the R5 placeholder AND the literal-action safeguard appended.
    expect(out).not.toContain('{R5_INJECT');
    expect(out).toContain('Still, before you do this deploy');
  });
});
